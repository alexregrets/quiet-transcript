import { motion } from "framer-motion";
import { ArrowLeft, Check, Eye, EyeOff, KeyRound, Loader2, Trash2, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { loadGladiaKey, maskGladiaKey, saveGladiaKey } from "../lib/apiKey";
import { verifyGladiaKeyOnDesktop } from "../lib/desktopBridge";
import type { Locale } from "../lib/i18n";
import { copy } from "../lib/i18n";

interface SettingsViewProps {
  locale: Locale;
  onBack: () => void;
  onKeyChange: (key: string) => void;
}

type Status = { tone: "ok" | "warn" | "error"; message: string };

export const SettingsView = ({ locale, onBack, onKeyChange }: SettingsViewProps) => {
  const t = copy[locale];
  const [savedKey, setSavedKey] = useState(() => loadGladiaKey());
  const [draft, setDraft] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<Status>();

  const commit = (key: string) => {
    saveGladiaKey(key);
    setSavedKey(key);
    setDraft("");
    onKeyChange(key);
  };

  const handleSave = () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      return;
    }

    commit(trimmed);
    setStatus({ tone: "ok", message: t.keySaved });
  };

  const handleRemove = () => {
    commit("");
    setStatus({ tone: "warn", message: t.usingEnvKey });
  };

  const handleTest = async () => {
    const candidate = draft.trim() || savedKey;
    if (!candidate) {
      return;
    }

    setChecking(true);
    setStatus(undefined);

    try {
      const verdict = await verifyGladiaKeyOnDesktop(candidate);
      // A key that passes verification is worth keeping, so testing a draft also saves it.
      if (draft.trim()) {
        commit(candidate);
      }
      setStatus(
        verdict === "valid"
          ? { tone: "ok", message: t.keyValid }
          : { tone: "warn", message: t.keyUnverified }
      );
    } catch (cause) {
      setStatus({ tone: "error", message: cause instanceof Error ? cause.message : String(cause) });
    } finally {
      setChecking(false);
    }
  };

  const statusColor =
    status?.tone === "ok" ? "text-green-500" : status?.tone === "warn" ? "text-amber-500" : "text-red-500";

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto w-full max-w-2xl"
    >
      <button
        className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-app-muted transition hover:text-app-text"
        type="button"
        onClick={onBack}
      >
        <ArrowLeft className="h-4 w-4" />
        {t.back}
      </button>

      <div className="glass-panel rounded-app p-7">
        <div className="mb-5 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-card bg-app-text text-app-bg">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-app-text">{t.apiKeyTitle}</h2>
            <p className="text-xs uppercase tracking-[0.16em] text-app-muted">{t.settings}</p>
          </div>
        </div>

        <p className="mb-6 text-sm leading-6 text-app-muted">{t.apiKeyIntro}</p>

        {savedKey ? (
          <div className="mb-5 flex items-center justify-between gap-4 rounded-card border border-app-border/80 bg-app-panel px-4 py-3">
            <span className="font-mono text-sm text-app-text">{maskGladiaKey(savedKey)}</span>
            <button
              className="inline-flex items-center gap-2 text-sm font-semibold text-app-muted transition hover:text-red-500"
              type="button"
              onClick={handleRemove}
            >
              <Trash2 className="h-4 w-4" />
              {t.removeKey}
            </button>
          </div>
        ) : (
          <div className="mb-5 flex items-center gap-2 rounded-card border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-app-text">
            <TriangleAlert className="h-4 w-4 shrink-0 text-amber-500" />
            {t.usingEnvKey}
          </div>
        )}

        <div className="relative mb-3">
          <input
            className="h-12 w-full rounded-card border border-app-border bg-app-panel px-4 pr-12 font-mono text-sm text-app-text outline-none transition focus:border-app-accent"
            type={revealed ? "text" : "password"}
            autoComplete="off"
            spellCheck={false}
            placeholder={t.apiKeyPlaceholder}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                handleSave();
              }
            }}
          />
          <button
            className="absolute right-3 top-1/2 -translate-y-1/2 text-app-muted transition hover:text-app-text"
            type="button"
            tabIndex={-1}
            onClick={() => setRevealed((current) => !current)}
          >
            {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            className="inline-flex h-10 items-center gap-2 rounded-full bg-app-text px-5 text-sm font-semibold text-app-bg transition hover:opacity-90 disabled:opacity-40"
            type="button"
            disabled={!draft.trim()}
            onClick={handleSave}
          >
            <Check className="h-4 w-4" />
            {t.save}
          </button>
          <button
            className="inline-flex h-10 items-center gap-2 rounded-full border border-app-border bg-app-panel px-5 text-sm font-semibold text-app-text transition hover:bg-app-panel-strong disabled:opacity-40"
            type="button"
            disabled={checking || !(draft.trim() || savedKey)}
            onClick={() => void handleTest()}
          >
            {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {checking ? t.checking : t.testKey}
          </button>
        </div>

        {status ? <p className={`mt-4 text-sm font-medium ${statusColor}`}>{status.message}</p> : null}

        <p className="mt-6 border-t border-app-border/60 pt-5 text-xs leading-5 text-app-muted">{t.apiKeyHint}</p>
      </div>
    </motion.section>
  );
};
