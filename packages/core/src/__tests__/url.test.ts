import { describe, expect, it } from "vitest";
import { describeUrlSupport, isDirectMediaUrl, validateHttpUrl } from "../source/url";

describe("validateHttpUrl", () => {
  it("accepts http and https", () => {
    expect(validateHttpUrl("https://example.com/a.mp3").ok).toBe(true);
    expect(validateHttpUrl("http://example.com/a.mp3").ok).toBe(true);
  });

  it("rejects other schemes", () => {
    const result = validateHttpUrl("ftp://example.com/a.mp3");
    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.error).toMatch(/http/i);
  });

  it("rejects text that is not a URL", () => {
    expect(validateHttpUrl("not a url").ok).toBe(false);
    expect(validateHttpUrl("").ok).toBe(false);
  });
});

describe("isDirectMediaUrl", () => {
  it("recognises every supported media extension", () => {
    for (const extension of ["mp3", "wav", "m4a", "aac", "ogg", "opus", "flac", "mp4", "mov", "webm", "mkv"]) {
      expect(isDirectMediaUrl(`https://example.com/clip.${extension}`)).toBe(true);
    }
  });

  it("ignores extension casing", () => {
    expect(isDirectMediaUrl("https://example.com/clip.MP3")).toBe(true);
  });

  it("is not fooled by a media extension in the query string", () => {
    expect(isDirectMediaUrl("https://example.com/watch?file=song.mp3")).toBe(false);
  });

  it("rejects pages and unsupported extensions", () => {
    expect(isDirectMediaUrl("https://youtube.com/watch?v=abc")).toBe(false);
    expect(isDirectMediaUrl("https://example.com/notes.pdf")).toBe(false);
  });
});

describe("describeUrlSupport", () => {
  it("labels direct media", () => {
    expect(describeUrlSupport("https://example.com/a.wav")).toBe("direct-media");
  });

  it("labels pages as needing an extractor", () => {
    expect(describeUrlSupport("https://www.youtube.com/watch?v=abc")).toBe("extractor-required");
  });

  it("labels malformed input as invalid", () => {
    expect(describeUrlSupport("nonsense")).toBe("invalid");
  });
});
