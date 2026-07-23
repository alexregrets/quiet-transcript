import { describeUrlSupport } from "@transcriber/core";

/** The Bot API refuses to hand a bot any file larger than this, so reject early with a clear reason. */
export const TELEGRAM_MAX_FILE_BYTES = 20 * 1024 * 1024;

/** Audio extracted from a long video can still be huge; cap what we forward to Gladia. */
export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

export type TextRequest =
  | { kind: "url"; url: string; needsExtraction: boolean }
  | { kind: "invalid-url" };

/**
 * Decides what a plain text message means. Anything that parses as http(s) is accepted:
 * direct media goes straight to Gladia, everything else needs yt-dlp to pull the audio first.
 */
export const classifyText = (text: string): TextRequest => {
  const trimmed = text.trim();
  const support = describeUrlSupport(trimmed);

  if (support === "invalid") {
    return { kind: "invalid-url" };
  }

  return { kind: "url", url: trimmed, needsExtraction: support === "extractor-required" };
};

export type SizeVerdict = { ok: true } | { ok: false; reason: "empty" | "too-large"; limitBytes: number };

export const checkTelegramFileSize = (sizeBytes: number | undefined): SizeVerdict => {
  if (sizeBytes !== undefined && sizeBytes <= 0) {
    return { ok: false, reason: "empty", limitBytes: TELEGRAM_MAX_FILE_BYTES };
  }

  // An absent size is treated as acceptable; the download itself will fail loudly if it is not.
  if (sizeBytes !== undefined && sizeBytes > TELEGRAM_MAX_FILE_BYTES) {
    return { ok: false, reason: "too-large", limitBytes: TELEGRAM_MAX_FILE_BYTES };
  }

  return { ok: true };
};

export const checkUploadSize = (sizeBytes: number): SizeVerdict => {
  if (sizeBytes <= 0) {
    return { ok: false, reason: "empty", limitBytes: MAX_UPLOAD_BYTES };
  }

  if (sizeBytes > MAX_UPLOAD_BYTES) {
    return { ok: false, reason: "too-large", limitBytes: MAX_UPLOAD_BYTES };
  }

  return { ok: true };
};

export const formatBytes = (bytes: number) => {
  const megabytes = bytes / (1024 * 1024);
  return megabytes >= 1024 ? `${(megabytes / 1024).toFixed(1)} GB` : `${Math.round(megabytes)} MB`;
};

/** Falls back to a generated name so Gladia always receives a usable extension. */
export const resolveFilename = (filename: string | undefined, mimeType: string | undefined) => {
  const trimmed = filename?.trim();
  if (trimmed) {
    return trimmed;
  }

  const extension = mimeType?.split("/").at(-1)?.split(";").at(0)?.trim();
  return extension ? `telegram-audio.${extension}` : "telegram-audio.ogg";
};
