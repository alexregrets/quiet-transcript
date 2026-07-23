import { verifyGladiaKey, type TranscriptionSource } from "@transcriber/core";
import { Telegraf, type Context } from "telegraf";
import { message } from "telegraf/filters";
import { loadEnvironment, readConfig } from "./config";
import { extractAudio } from "./extract";
import { createKeyStore, isPlausibleKey } from "./keystore";
import { formatDuration, messages, pickLocale, type BotLocale } from "./messages";
import { createProvider, transcribeAudioBytes, transcribeDirectUrl, type TranscriptionOutput } from "./pipeline";
import {
  checkTelegramFileSize,
  checkUploadSize,
  classifyText,
  formatBytes,
  resolveFilename,
  TELEGRAM_MAX_FILE_BYTES
} from "./router";

const envFile = loadEnvironment();
const configResult = readConfig(envFile);

if (!configResult.ok) {
  console.log(`Bot is not running. Set ${configResult.missing.join(" and ")}${envFile ? ` in ${envFile}` : ""}.`);
  process.exit(0);
}

const { telegramToken, keystorePath } = configResult.config;
const keystore = await createKeyStore(keystorePath);
const bot = new Telegraf(telegramToken);

/** One job per chat: transcription is slow, and parallel jobs would waste the user's quota. */
const busyChats = new Set<number>();

interface Attachment {
  fileId: string;
  filename: string;
  mimeType?: string | undefined;
  sizeBytes?: number | undefined;
}

const localeOf = (ctx: Context): BotLocale => pickLocale(ctx.from?.language_code);

/** Sends a status message once, then edits it in place so the chat stays tidy. */
const createProgress = async (ctx: Context, initial: string) => {
  const sent = await ctx.reply(initial).catch(() => undefined);

  return async (text: string) => {
    if (!sent) {
      return;
    }

    await ctx.telegram.editMessageText(sent.chat.id, sent.message_id, undefined, text).catch(() => undefined);
  };
};

/** Returns the sender's own Gladia key, prompting them to add one when it is missing. */
const resolveUserKey = async (ctx: Context) => {
  const userId = ctx.from?.id;

  if (userId === undefined) {
    return undefined;
  }

  const key = keystore.get(userId);

  if (!key) {
    await ctx.reply(messages[localeOf(ctx)].noKey);
    return undefined;
  }

  return key;
};

const downloadTelegramFile = async (ctx: Context, fileId: string) => {
  const link = await ctx.telegram.getFileLink(fileId);
  const response = await fetch(link.toString());

  if (!response.ok) {
    throw new Error(`Telegram returned ${response.status} for the file download.`);
  }

  return Buffer.from(await response.arrayBuffer());
};

const deliver = async (ctx: Context, locale: BotLocale, output: TranscriptionOutput) => {
  const t = messages[locale];

  await ctx.replyWithDocument(
    { source: Buffer.from(output.markdown, "utf8"), filename: output.filename },
    { caption: t.caption(output.result.title, formatDuration(output.result.durationSeconds)).slice(0, 1024) }
  );
};

/**
 * Wraps a job with the busy guard and error reporting, so every handler tells the
 * user what happened instead of failing silently in the logs.
 */
const runJob = async (ctx: Context, job: (report: (text: string) => Promise<void>) => Promise<void>) => {
  const t = messages[localeOf(ctx)];
  const chatId = ctx.chat?.id;

  if (chatId === undefined) {
    return;
  }

  if (busyChats.has(chatId)) {
    await ctx.reply(t.busy);
    return;
  }

  busyChats.add(chatId);

  try {
    const report = await createProgress(ctx, t.queued);
    await job(report);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    console.error("[bot] job failed:", reason);
    await ctx.reply(t.failed(reason)).catch(() => undefined);
  } finally {
    busyChats.delete(chatId);
  }
};

const handleAttachment = async (ctx: Context, attachment: Attachment) => {
  const locale = localeOf(ctx);
  const t = messages[locale];

  const apiKey = await resolveUserKey(ctx);
  if (!apiKey) {
    return;
  }

  const sizeVerdict = checkTelegramFileSize(attachment.sizeBytes);
  if (!sizeVerdict.ok) {
    await ctx.reply(sizeVerdict.reason === "empty" ? t.empty : t.tooLarge(formatBytes(TELEGRAM_MAX_FILE_BYTES)));
    return;
  }

  await runJob(ctx, async (report) => {
    await report(t.downloading);
    const bytes = await downloadTelegramFile(ctx, attachment.fileId);
    const uploadVerdict = checkUploadSize(bytes.byteLength);

    if (!uploadVerdict.ok) {
      await ctx.reply(
        uploadVerdict.reason === "empty" ? t.empty : t.uploadTooLarge(formatBytes(uploadVerdict.limitBytes))
      );
      return;
    }

    await report(t.transcribing);

    const source: TranscriptionSource = {
      kind: "file",
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      sizeBytes: bytes.byteLength
    };

    const output = await transcribeAudioBytes(createProvider(apiKey), {
      bytes,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      source
    });

    await deliver(ctx, locale, output);
  });
};

bot.start((ctx) => ctx.reply(messages[localeOf(ctx)].start));
bot.help((ctx) => ctx.reply(messages[localeOf(ctx)].help));

bot.command("setkey", async (ctx) => {
  const t = messages[localeOf(ctx)];
  const userId = ctx.from.id;
  const candidate = ctx.message.text.split(/\s+/).slice(1).join(" ").trim();

  // Best effort: bots usually cannot delete a user's own message in a private chat,
  // so the user is told to remove it themselves rather than assuming it is gone.
  await ctx.deleteMessage().catch(() => undefined);

  if (!candidate) {
    await ctx.reply(t.setKeyUsage);
    return;
  }

  if (!isPlausibleKey(candidate)) {
    await ctx.reply(t.keyBadFormat);
    return;
  }

  await ctx.reply(t.checkingKey);

  let verdict: "valid" | "unverified";

  try {
    verdict = await verifyGladiaKey(candidate);
  } catch {
    // verifyGladiaKey only throws when Gladia actively refuses the key.
    await ctx.reply(t.keyRejected);
    return;
  }

  await keystore.set(userId, candidate);
  await ctx.reply(verdict === "valid" ? t.keySaved : t.keyUnverified);
  await ctx.reply(t.deleteMessageHint);
});

bot.command("deletekey", async (ctx) => {
  const t = messages[localeOf(ctx)];
  const removed = await keystore.remove(ctx.from.id);
  await ctx.reply(removed ? t.keyRemoved : t.keyNotStored);
});

bot.on(message("voice"), (ctx) =>
  handleAttachment(ctx, {
    fileId: ctx.message.voice.file_id,
    filename: resolveFilename(undefined, ctx.message.voice.mime_type),
    mimeType: ctx.message.voice.mime_type,
    sizeBytes: ctx.message.voice.file_size
  })
);

bot.on(message("audio"), (ctx) =>
  handleAttachment(ctx, {
    fileId: ctx.message.audio.file_id,
    filename: resolveFilename(ctx.message.audio.file_name, ctx.message.audio.mime_type),
    mimeType: ctx.message.audio.mime_type,
    sizeBytes: ctx.message.audio.file_size
  })
);

bot.on(message("video"), (ctx) =>
  handleAttachment(ctx, {
    fileId: ctx.message.video.file_id,
    filename: resolveFilename(ctx.message.video.file_name, ctx.message.video.mime_type),
    mimeType: ctx.message.video.mime_type,
    sizeBytes: ctx.message.video.file_size
  })
);

bot.on(message("video_note"), (ctx) =>
  handleAttachment(ctx, {
    fileId: ctx.message.video_note.file_id,
    filename: "video-note.mp4",
    mimeType: "video/mp4",
    sizeBytes: ctx.message.video_note.file_size
  })
);

bot.on(message("document"), async (ctx) => {
  const document = ctx.message.document;
  const isMedia = document.mime_type?.startsWith("audio/") || document.mime_type?.startsWith("video/");

  if (!isMedia) {
    await ctx.reply(messages[localeOf(ctx)].unsupportedDocument);
    return;
  }

  await handleAttachment(ctx, {
    fileId: document.file_id,
    filename: resolveFilename(document.file_name, document.mime_type),
    mimeType: document.mime_type,
    sizeBytes: document.file_size
  });
});

bot.on(message("text"), async (ctx) => {
  const locale = localeOf(ctx);
  const t = messages[locale];

  // Unrecognised commands should not be read as links.
  if (ctx.message.text.startsWith("/")) {
    await ctx.reply(t.help);
    return;
  }

  const request = classifyText(ctx.message.text);

  if (request.kind === "invalid-url") {
    await ctx.reply(t.invalidUrl);
    return;
  }

  const apiKey = await resolveUserKey(ctx);
  if (!apiKey) {
    return;
  }

  await runJob(ctx, async (report) => {
    const provider = createProvider(apiKey);

    if (!request.needsExtraction) {
      await report(t.transcribing);
      await deliver(ctx, locale, await transcribeDirectUrl(provider, request.url));
      return;
    }

    await report(t.extracting);
    const extracted = await extractAudio(request.url);
    const uploadVerdict = checkUploadSize(extracted.bytes.byteLength);

    if (!uploadVerdict.ok) {
      await ctx.reply(
        uploadVerdict.reason === "empty" ? t.empty : t.uploadTooLarge(formatBytes(uploadVerdict.limitBytes))
      );
      return;
    }

    await report(t.transcribing);

    const output = await transcribeAudioBytes(provider, {
      bytes: extracted.bytes,
      filename: extracted.filename,
      mimeType: "audio/mp4",
      // Recorded against the link the user sent, not the temporary extracted file.
      source: { kind: "url", url: request.url }
    });

    await deliver(ctx, locale, output);
  });
});

void bot.launch(() =>
  console.log(`Bot started. Keys for ${keystore.size()} user(s) loaded from ${keystorePath}.`)
);

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
