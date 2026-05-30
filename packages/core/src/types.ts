export type TranscriptionStatus = "queued" | "uploading" | "extracting" | "sending" | "transcribing" | "building_markdown" | "done" | "error";

export type TranscriptionSource =
  | {
      kind: "file";
      filename: string;
      mimeType?: string | undefined;
      sizeBytes?: number | undefined;
    }
  | {
      kind: "url";
      url: string;
    };

export interface TranscriptSegment {
  startSeconds?: number | undefined;
  endSeconds?: number | undefined;
  speaker?: string | undefined;
  text: string;
}

export interface TranscriptionResult {
  id?: string | undefined;
  title: string;
  source: TranscriptionSource;
  language?: string | undefined;
  durationSeconds?: number | undefined;
  createdAt: string;
  text: string;
  segments?: TranscriptSegment[] | undefined;
  provider: string;
}

export interface TranscriptionRequest {
  source: TranscriptionSource;
  file?: Blob | undefined;
  audioUrl?: string | undefined;
  title?: string | undefined;
  languageHints?: string[] | undefined;
}

export interface TranscriptionProvider {
  readonly name: string;
  transcribe(request: TranscriptionRequest): Promise<TranscriptionResult>;
}

export interface HistoryRecord extends TranscriptionResult {
  status: TranscriptionStatus;
  markdown: string;
  storage?: "local" | "cloud" | undefined;
}
