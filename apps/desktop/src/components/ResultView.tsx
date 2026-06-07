import type { HistoryRecord } from "@transcriber/core";
import { Check, Copy, Download, FileText, Plus, Save } from "lucide-react";
import { motion } from "framer-motion";
import type { Locale } from "../lib/i18n";
import { copy } from "../lib/i18n";

interface ResultViewProps {
  locale: Locale;
  record: HistoryRecord;
  copied?: boolean;
  onCopy: () => void;
  onDownload: () => void;
  onSave: () => void;
  onNew: () => void;
}

export const ResultView = ({ locale, record, copied, onCopy, onDownload, onSave, onNew }: ResultViewProps) => {
  const t = copy[locale];
  const source = record.source.kind === "file" ? record.source.filename : record.source.url;

  return (
    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mx-auto w-full max-w-5xl">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-app-muted">{t.transcript}</p>
          <h2 className="mt-2 text-4xl font-semibold text-app-text">{record.title}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="inline-flex h-10 items-center gap-2 rounded-full border border-app-border bg-app-panel px-4 text-sm font-semibold text-app-text transition hover:bg-app-panel-strong" type="button" onClick={onCopy}>
            {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            {copied ? (locale === "ru" ? "Скопировано" : "Copied!") : t.copyMarkdown}
          </button>
          <button className="inline-flex h-10 items-center gap-2 rounded-full border border-app-border bg-app-panel px-4 text-sm font-semibold text-app-text transition hover:bg-app-panel-strong" type="button" onClick={onDownload}>
            <Download className="h-4 w-4" />
            {t.downloadMarkdown}
          </button>
          <button className="inline-flex h-10 items-center gap-2 rounded-full bg-app-text px-4 text-sm font-semibold text-app-bg transition hover:opacity-90" type="button" onClick={onSave}>
            <Save className="h-4 w-4" />
            {t.saveHistory}
          </button>
          <button className="inline-flex h-10 items-center gap-2 rounded-full border border-app-border bg-app-panel px-4 text-sm font-semibold text-app-text transition hover:bg-app-panel-strong" type="button" onClick={onNew}>
            <Plus className="h-4 w-4" />
            {t.new}
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <aside className="glass-panel h-fit rounded-app p-5">
          <div className="mb-4 grid h-11 w-11 place-items-center rounded-card bg-app-text text-app-bg">
            <FileText className="h-5 w-5" />
          </div>
          <dl className="space-y-4 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-[0.16em] text-app-muted">Source</dt>
              <dd className="mt-1 break-words font-medium text-app-text">{source}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.16em] text-app-muted">Language</dt>
              <dd className="mt-1 font-medium text-app-text">{record.language ?? "Unknown"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.16em] text-app-muted">Provider</dt>
              <dd className="mt-1 font-medium text-app-text">{record.provider}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.16em] text-app-muted">Created</dt>
              <dd className="mt-1 font-medium text-app-text">{new Date(record.createdAt).toLocaleString(locale === "ru" ? "ru-RU" : "en-US")}</dd>
            </div>
          </dl>
        </aside>

        <article className="glass-panel overflow-hidden rounded-app">
          <div className="border-b border-app-border/80 px-5 py-4 text-sm font-semibold text-app-text">Markdown</div>
          <pre className="max-h-[560px] overflow-auto whitespace-pre-wrap p-5 text-sm leading-7 text-app-text">{record.markdown}</pre>
        </article>
      </div>
    </motion.section>
  );
};
