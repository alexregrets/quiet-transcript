import { Check, Copy, Download, Maximize2, Wand2 } from "lucide-react";
import { useRef } from "react";
import type { HistoryRecord } from "@transcriber/core";
import type { Locale } from "../lib/i18n";
import { copy } from "../lib/i18n";

interface MiniViewProps {
  locale: Locale;
  url: string;
  disabled: boolean;
  processing: boolean;
  error?: string | undefined;
  selected: HistoryRecord | null;
  copied: boolean;
  log: string[];
  onUrlChange: (value: string) => void;
  onUrlSubmit: () => void;
  onFileSelect: (file: File) => void;
  onCopy: () => void;
  onDownload: () => void;
  onSave: () => void;
  onNew: () => void;
  onExpand: () => void;
}

export const MiniView = ({
  locale, url, disabled, processing, error, selected, copied, log,
  onUrlChange, onUrlSubmit, onFileSelect, onCopy, onDownload, onSave, onNew, onExpand
}: MiniViewProps) => {
  const t = copy[locale];
  const fileRef = useRef<HTMLInputElement>(null);

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      onUrlChange(text.trim());
    } catch { /* clipboard read failed */ }
  };

  return (
    <div className="flex h-screen flex-col gap-3 bg-app-bg p-4 text-app-text">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded-lg bg-app-text text-app-bg text-xs font-bold">T</div>
          <span className="text-xs font-semibold text-app-text">Transcribe.md</span>
        </div>
        <button
          onClick={onExpand}
          className="rounded-lg border border-app-border/60 bg-app-panel p-1.5 text-app-muted transition hover:text-app-text"
          title={t.expand}
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* URL input + paste */}
      <div className="flex gap-1.5">
        <input
          className="quiet-input min-w-0 flex-1 rounded-xl px-3 py-2 text-sm"
          placeholder="YouTube, TikTok, VK…"
          value={url}
          disabled={disabled}
          onChange={(e) => onUrlChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !disabled && url.trim()) onUrlSubmit(); }}
        />
        <button
          onClick={() => void paste()}
          className="rounded-xl border border-app-border/60 bg-app-panel px-3 py-2 text-xs font-medium text-app-muted transition hover:text-app-text"
          title="Paste"
        >
          Paste
        </button>
      </div>

      {/* File drop zone */}
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={disabled}
        className="flex h-20 w-full items-center justify-center rounded-xl border-2 border-dashed border-app-border/70 bg-app-panel/60 text-sm text-app-muted transition hover:border-app-text/40 hover:text-app-text disabled:opacity-50"
      >
        {t.dropOrClick}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="audio/*,video/*"
        className="hidden"
        disabled={disabled}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFileSelect(f); }}
      />

      {/* Transcribe button */}
      <button
        type="button"
        onClick={onUrlSubmit}
        disabled={disabled || !url.trim()}
        className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-app-text text-sm font-semibold text-app-bg transition hover:opacity-90 disabled:opacity-40"
      >
        <Wand2 className="h-4 w-4" />
        {t.transcribeBtn}
      </button>

      {/* Error */}
      {error && (
        <p className="rounded-xl border border-red-300/60 bg-red-100/60 px-3 py-2 text-xs text-red-800">{error}</p>
      )}

      {/* Processing log */}
      {processing && (
        <p className="text-center text-xs text-app-muted">{log.at(-1) ?? "…"}</p>
      )}

      {/* Result actions */}
      {selected && !processing && (
        <div className="mt-auto flex flex-col gap-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCopy}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-app-border bg-app-panel py-2 text-xs font-semibold text-app-text transition hover:bg-app-panel-strong"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? (locale === "ru" ? "Скопировано" : "Copied!") : t.copyMarkdown}
            </button>
            <button
              type="button"
              onClick={onDownload}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-app-border bg-app-panel py-2 text-xs font-semibold text-app-text transition hover:bg-app-panel-strong"
            >
              <Download className="h-3.5 w-3.5" />
              {t.downloadMarkdown}
            </button>
          </div>
          <button
            type="button"
            onClick={onSave}
            className="text-center text-xs text-app-muted underline decoration-dotted transition hover:text-app-text"
          >
            {t.saveHistory}
          </button>
          <button
            type="button"
            onClick={onNew}
            className="text-center text-xs text-app-muted transition hover:text-app-text"
          >
            + {t.new}
          </button>
        </div>
      )}
    </div>
  );
};
