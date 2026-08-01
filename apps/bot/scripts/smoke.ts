/**
 * Manual end-to-end check against the real Gladia API.
 *
 * Spends transcription quota, so it is never wired into CI — run it by hand when you
 * need to confirm that a key works and that the audio a source produces is something
 * Gladia actually accepts.
 *
 * Usage:
 *   pnpm --filter @transcriber/bot smoke path/to/audio.m4a
 *   pnpm --filter @transcriber/bot smoke https://example.com/talk.mp3
 *   pnpm --filter @transcriber/bot smoke https://www.youtube.com/watch?v=...   (needs yt-dlp on PATH)
 *
 * Reads GLADIA_API_KEY from the repo-root .env.
 */
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { isDirectMediaUrl, validateHttpUrl } from "@transcriber/core";
import { loadEnvironment } from "../src/config";
import { extractAudio } from "../src/extract";
import { createProvider, transcribeAudioBytes, transcribeDirectUrl, type TranscriptionOutput } from "../src/pipeline";

const source = process.argv[2];

if (!source) {
  console.error("Usage: pnpm --filter @transcriber/bot smoke <file-path|url>");
  process.exit(1);
}

const envFile = loadEnvironment();
const apiKey = process.env.GLADIA_API_KEY?.trim();

if (!apiKey) {
  console.error(`GLADIA_API_KEY is not set${envFile ? ` in ${envFile}` : ""}.`);
  process.exit(1);
}

const provider = createProvider(apiKey);
const startedAt = Date.now();

const run = async (): Promise<TranscriptionOutput> => {
  const isUrl = validateHttpUrl(source).ok;

  if (isUrl && isDirectMediaUrl(source)) {
    console.log("→ direct media URL, handing it straight to Gladia");
    return transcribeDirectUrl(provider, source);
  }

  if (isUrl) {
    console.log("→ page URL, extracting audio with yt-dlp");
    const extracted = await extractAudio(source);
    console.log(`  extracted ${extracted.filename} (${(extracted.bytes.byteLength / 1024 / 1024).toFixed(1)} MB)`);

    return transcribeAudioBytes(provider, {
      bytes: extracted.bytes,
      filename: extracted.filename,
      mimeType: "audio/mp4",
      source: { kind: "url", url: source }
    });
  }

  console.log("→ local file, uploading to Gladia");
  const bytes = await readFile(source);
  const filename = basename(source);

  return transcribeAudioBytes(provider, {
    bytes,
    filename,
    source: { kind: "file", filename, sizeBytes: bytes.byteLength }
  });
};

const output = await run();
const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);

console.log("\n--- result ---");
console.log(`took:      ${seconds}s`);
console.log(`title:     ${output.result.title}`);
console.log(`language:  ${output.result.language ?? "unknown"}`);
console.log(`duration:  ${output.result.durationSeconds ?? "unknown"}s`);
console.log(`segments:  ${output.result.segments?.length ?? 0}`);
console.log(`markdown:  ${output.markdown.length} chars → ${output.filename}`);
console.log(`\ntranscript starts: ${output.result.text.slice(0, 200) || "(empty)"}`);
