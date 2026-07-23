import { describe, expect, it } from "vitest";
import {
  checkTelegramFileSize,
  checkUploadSize,
  classifyText,
  formatBytes,
  MAX_UPLOAD_BYTES,
  resolveFilename,
  TELEGRAM_MAX_FILE_BYTES
} from "../router";

describe("classifyText", () => {
  it("sends a direct media URL straight to Gladia", () => {
    expect(classifyText("https://example.com/audio.mp3")).toEqual({
      kind: "url",
      url: "https://example.com/audio.mp3",
      needsExtraction: false
    });
  });

  it("routes social links through extraction", () => {
    for (const url of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://www.tiktok.com/@user/video/123",
      "https://vk.com/video-1_2",
      "https://rutube.ru/video/abc/"
    ]) {
      expect(classifyText(url)).toEqual({ kind: "url", url, needsExtraction: true });
    }
  });

  it("trims surrounding whitespace", () => {
    expect(classifyText("  https://example.com/a.wav  ")).toEqual({
      kind: "url",
      url: "https://example.com/a.wav",
      needsExtraction: false
    });
  });

  it("rejects anything that is not an http(s) URL", () => {
    for (const text of ["hello", "", "ftp://example.com/a.mp3", "just some words"]) {
      expect(classifyText(text)).toEqual({ kind: "invalid-url" });
    }
  });
});

describe("checkTelegramFileSize", () => {
  it("accepts a missing size, since the download will fail loudly instead", () => {
    expect(checkTelegramFileSize(undefined)).toEqual({ ok: true });
  });

  it("accepts a file at the limit", () => {
    expect(checkTelegramFileSize(TELEGRAM_MAX_FILE_BYTES)).toEqual({ ok: true });
  });

  it("rejects a file over the limit", () => {
    expect(checkTelegramFileSize(TELEGRAM_MAX_FILE_BYTES + 1)).toEqual({
      ok: false,
      reason: "too-large",
      limitBytes: TELEGRAM_MAX_FILE_BYTES
    });
  });

  it("rejects an empty file", () => {
    expect(checkTelegramFileSize(0)).toEqual({
      ok: false,
      reason: "empty",
      limitBytes: TELEGRAM_MAX_FILE_BYTES
    });
  });
});

describe("checkUploadSize", () => {
  it("accepts audio within the upload cap", () => {
    expect(checkUploadSize(1024)).toEqual({ ok: true });
    expect(checkUploadSize(MAX_UPLOAD_BYTES)).toEqual({ ok: true });
  });

  it("rejects extracted audio over the cap", () => {
    expect(checkUploadSize(MAX_UPLOAD_BYTES + 1)).toEqual({
      ok: false,
      reason: "too-large",
      limitBytes: MAX_UPLOAD_BYTES
    });
  });

  it("rejects empty audio", () => {
    expect(checkUploadSize(0)).toEqual({ ok: false, reason: "empty", limitBytes: MAX_UPLOAD_BYTES });
  });
});

describe("resolveFilename", () => {
  it("keeps a name Telegram already provided", () => {
    expect(resolveFilename("lecture.mp3", "audio/mpeg")).toBe("lecture.mp3");
  });

  it("derives an extension from the mime type when there is no name", () => {
    expect(resolveFilename(undefined, "audio/ogg")).toBe("telegram-audio.ogg");
  });

  it("strips mime type parameters, which voice messages carry", () => {
    expect(resolveFilename(undefined, "audio/ogg; codecs=opus")).toBe("telegram-audio.ogg");
  });

  it("falls back to ogg when nothing is known", () => {
    expect(resolveFilename(undefined, undefined)).toBe("telegram-audio.ogg");
    expect(resolveFilename("   ", undefined)).toBe("telegram-audio.ogg");
  });
});

describe("formatBytes", () => {
  it("reports megabytes below a gigabyte", () => {
    expect(formatBytes(TELEGRAM_MAX_FILE_BYTES)).toBe("20 MB");
    expect(formatBytes(MAX_UPLOAD_BYTES)).toBe("500 MB");
  });

  it("switches to gigabytes above the threshold", () => {
    expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe("2.0 GB");
  });
});
