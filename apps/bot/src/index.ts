import type { TranscriptionSource } from "@transcriber/core";
import { Telegraf, type Context } from "telegraf";
import { message } from "telegraf/filters";
import { loadEnvironment, readConfig } from "./config";
import { extractAudio } from "./extract";
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
const configResult = readConfig();

if (!configResult.ok) {
  console.log(`Bot is not running. Set ${configResult.missing.join(" and ")}${envFile ? ` in ${envFile}` : ""}.`);
  process.exit(0);
}

const provider = createProvider(configResult.config.gladiaApiKey);
const bot = new Telegraf(configResult.config.telegramToken);

/** One job per chat: transcription is slow, and parallel jobs would burn Gladia quota. */
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

    const output = await transcribeAudioBytes(provider, {
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
  const request = classifyText(ctx.message.text);

  if (request.kind === "invalid-url") {
    await ctx.reply(t.invalidUrl);
    return;
  }

  await runJob(ctx, async (report) => {
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

void bot.launch(() => console.log(`Bot started${envFile ? ` (env: ${envFile})` : ""}.`));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
