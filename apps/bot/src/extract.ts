import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const EXTRACTION_TIMEOUT_MS = 10 * 60 * 1000;

export interface ExtractedAudio {
  filename: string;
  bytes: Buffer;
}

/**
 * Pulls the audio track out of a page URL with yt-dlp.
 *
 * Security: the URL is passed as an argv entry to execFile, never through a shell,
 * so a hostile link cannot inject commands.
 */
export const extractAudio = async (url: string): Promise<ExtractedAudio> => {
  const outputTemplate = join(tmpdir(), `qt_${randomUUID()}.%(ext)s`);
  let producedPath: string | undefined;

  try {
    const { stdout } = await execFileAsync(
      "yt-dlp",
      [
        "--extract-audio",
        "--audio-format",
        "m4a",
        "--audio-quality",
        "0",
        "--no-playlist",
        "--no-warnings",
        "--print",
        "after_move:filepath",
        "-o",
        outputTemplate,
        url
      ],
      { timeout: EXTRACTION_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 }
    );

    producedPath = stdout.trim().split(/\r?\n/).at(-1)?.trim();

    if (!producedPath || !existsSync(producedPath)) {
      throw new Error("yt-dlp finished but produced no audio file.");
    }

    return { filename: basename(producedPath), bytes: await readFile(producedPath) };
  } catch (cause) {
    if (isMissingBinary(cause)) {
      throw new Error("yt-dlp is not installed on this server.");
    }

    throw new Error(`Could not extract audio: ${describeFailure(cause)}`);
  } finally {
    if (producedPath) {
      await rm(producedPath, { force: true }).catch(() => undefined);
    }
  }
};

const isMissingBinary = (cause: unknown) =>
  typeof cause === "object" && cause !== null && (cause as { code?: string }).code === "ENOENT";

/** yt-dlp explains itself on stderr; that is far more useful than the generic exec error. */
const describeFailure = (cause: unknown) => {
  if (typeof cause === "object" && cause !== null) {
    const stderr = (cause as { stderr?: string }).stderr?.trim();
    if (stderr) {
      return stderr.split(/\r?\n/).at(-1) ?? stderr;
    }
  }

  return cause instanceof Error ? cause.message : String(cause);
};
