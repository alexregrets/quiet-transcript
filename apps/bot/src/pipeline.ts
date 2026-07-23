import {
  GladiaProvider,
  buildMarkdown,
  markdownFilename,
  type TranscriptionProvider,
  type TranscriptionResult,
  type TranscriptionSource
} from "@transcriber/core";

export interface TranscriptionOutput {
  result: TranscriptionResult;
  markdown: string;
  filename: string;
}

export const createProvider = (apiKey: string): TranscriptionProvider => new GladiaProvider({ apiKey });

const toOutput = (result: TranscriptionResult): TranscriptionOutput => ({
  result,
  markdown: buildMarkdown(result),
  filename: markdownFilename(result.title)
});

/**
 * Uploads raw audio bytes to Gladia.
 *
 * `source` is passed separately from `filename` so a link that went through yt-dlp is
 * still recorded against the original URL rather than the temporary extracted file.
 */
export const transcribeAudioBytes = async (
  provider: TranscriptionProvider,
  params: {
    bytes: Buffer;
    filename: string;
    mimeType?: string | undefined;
    source: TranscriptionSource;
  }
): Promise<TranscriptionOutput> => {
  const type = params.mimeType ?? "application/octet-stream";
  // A File (not a bare Blob) keeps the filename in the multipart body, which Gladia
  // uses to work out the audio format.
  const file = new File([new Uint8Array(params.bytes)], params.filename, { type });

  const result = await provider.transcribe({ source: params.source, file });
  return toOutput(result);
};

/** For URLs that already point at a media file, Gladia can fetch them itself. */
export const transcribeDirectUrl = async (
  provider: TranscriptionProvider,
  url: string
): Promise<TranscriptionOutput> => {
  const result = await provider.transcribe({ source: { kind: "url", url }, audioUrl: url });
  return toOutput(result);
};
