import { describe, expect, it } from "vitest";
import { sanitizeFilename, titleFromSource } from "../source/sanitize";

describe("sanitizeFilename", () => {
  it("replaces characters that are illegal in filenames", () => {
    expect(sanitizeFilename('a<b>c:d"e/f\\g|h?i*j')).toBe("a-b-c-d-e-f-g-h-i-j");
  });

  it("collapses whitespace and trims", () => {
    expect(sanitizeFilename("  many   spaces  ")).toBe("many spaces");
  });

  it("caps the length so the result stays a usable filename", () => {
    expect(sanitizeFilename("x".repeat(300))).toHaveLength(120);
  });

  it("falls back only when the result would be empty", () => {
    expect(sanitizeFilename("")).toBe("transcript");
    expect(sanitizeFilename("   ")).toBe("transcript");
  });

  it("keeps a name made entirely of replacement characters, which is still legal", () => {
    expect(sanitizeFilename("///")).toBe("---");
  });
});

describe("titleFromSource", () => {
  it("drops the extension from a filename", () => {
    expect(titleFromSource({ kind: "file", filename: "Team Sync.mp3" })).toBe("Team Sync");
  });

  it("keeps dots that are part of the name", () => {
    expect(titleFromSource({ kind: "file", filename: "v1.2 notes.wav" })).toBe("v1.2 notes");
  });

  it("uses the last path segment of a URL", () => {
    expect(titleFromSource({ kind: "url", url: "https://example.com/talks/keynote.mp3" })).toBe("keynote.mp3");
  });

  it("decodes percent-encoded segments", () => {
    expect(titleFromSource({ kind: "url", url: "https://example.com/my%20talk.mp3" })).toBe("my talk.mp3");
  });

  it("falls back to the hostname when there is no path", () => {
    expect(titleFromSource({ kind: "url", url: "https://example.com" })).toBe("example.com");
  });

  it("survives a malformed URL", () => {
    expect(titleFromSource({ kind: "url", url: "not a url" })).toBe("URL transcript");
  });
});
