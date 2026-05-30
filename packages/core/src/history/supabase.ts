import type { HistoryRecord, TranscriptionStatus } from "../types";

export interface SupabaseHistoryRow {
  id: string;
  user_id: string;
  title: string;
  source_kind: "file" | "url";
  source_value: string;
  status: TranscriptionStatus;
  language: string | null;
  duration_seconds: number | null;
  markdown: string;
  transcript_text: string;
  provider: string;
  created_at: string;
}

export const toHistoryInsert = (userId: string, record: HistoryRecord) => ({
  user_id: userId,
  title: record.title,
  source_kind: record.source.kind,
  source_value: record.source.kind === "file" ? record.source.filename : record.source.url,
  status: record.status,
  language: record.language ?? null,
  duration_seconds: record.durationSeconds ?? null,
  markdown: record.markdown,
  transcript_text: record.text,
  provider: record.provider
});

export const fromHistoryRow = (row: SupabaseHistoryRow): HistoryRecord => ({
  id: row.id,
  title: row.title,
  source: row.source_kind === "file" ? { kind: "file", filename: row.source_value } : { kind: "url", url: row.source_value },
  status: row.status,
  language: row.language ?? undefined,
  durationSeconds: row.duration_seconds ?? undefined,
  createdAt: row.created_at,
  text: row.transcript_text,
  provider: row.provider,
  markdown: row.markdown,
  storage: "cloud"
});
