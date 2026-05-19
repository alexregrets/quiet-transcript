import type { TranscriptSegment, TranscriptionResult } from "./types";
import { sanitizeFilename } from "./source/sanitize";

const formatDuration = (seconds?: number) => {
  if (!seconds || seconds <= 0) {
    return "Unknown";
  }

  const rounded = Math.round(seconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remainingSeconds = rounded % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${remainingSeconds}s`;
  }

  return `${minutes}m ${remainingSeconds}s`;
};

const formatTimestamp = (seconds?: number) => {
  if (seconds === undefined) {
    return "";
  }

  const rounded = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(rounded / 60).toString().padStart(2, "0");
  const remainingSeconds = (rounded % 60).toString().padStart(2, "0");
  return `[${minutes}:${remainingSeconds}]`;
};

const segmentLine = (segment: TranscriptSegment) => {
  const timestamp = formatTimestamp(segment.startSeconds);
  const speaker = segment.speaker ? ` **${segment.speaker}:**` : "";
  return `- ${timestamp}${speaker} ${segment.text}`.replace("-  ", "- ");
};

export const buildMarkdown = (result: TranscriptionResult) => {
  const sourceValue = result.source.kind === "file" ? result.source.filename : result.source.url;
  const lines = [
    `# ${result.title}`,
    "",
    "| Field | Value |",
    "| --- | --- |",
    `| Source | ${sourceValue} |`,
    `| Language | ${result.language ?? "Unknown"} |`,
    `| Duration | ${formatDuration(result.durationSeconds)} |`,
    `| Created | ${result.createdAt} |`,
    `| Provider | ${result.provider} |`,
    "",
    "## Transcript",
    "",
    result.text.trim() || "_No transcript text returned._"
  ];

  if (result.segments?.length) {
    lines.push("", "## Timestamps", "", ...result.segments.map(segmentLine));
  }

  return `${lines.join("\n")}\n`;
};

export const markdownFilename = (title: string) => `${sanitizeFilename(title || "transcript")}.md`;
