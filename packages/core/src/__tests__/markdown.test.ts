import { describe, expect, it } from "vitest";
import { buildMarkdown, markdownFilename } from "../markdown";
import type { TranscriptionResult } from "../types";

const sample: TranscriptionResult = {
  title: "Launch Call",
  source: {
    kind: "url",
    url: "https://example.com/call.mp3"
  },
  language: "en",
  durationSeconds: 125,
  createdAt: "2026-05-11T12:00:00.000Z",
  text: "Hello from the transcript.",
  provider: "gladia",
  segments: [
    {
      startSeconds: 3,
      speaker: "Speaker 1",
      text: "Hello."
    }
  ]
};

describe("buildMarkdown", () => {
  it("includes transcript metadata and timestamps", () => {
    const markdown = buildMarkdown(sample);

    expect(markdown).toContain("# Launch Call");
    expect(markdown).toContain("| Source | https://example.com/call.mp3 |");
    expect(markdown).toContain("| Duration | 2m 5s |");
    expect(markdown).toContain("Hello from the transcript.");
    expect(markdown).toContain("- [00:03] **Speaker 1:** Hello.");
  });

  it("sanitizes download filenames", () => {
    expect(markdownFilename("Call: Q2 / Roadmap?")).toBe("Call- Q2 - Roadmap-.md");
  });
});
