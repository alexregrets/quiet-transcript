import type { User } from "@supabase/supabase-js";
import type { HistoryRecord } from "@transcriber/core";
import { FileText, LogOut, Plus, Sparkles } from "lucide-react";
import type { Locale } from "../lib/i18n";
import { copy } from "../lib/i18n";

interface SidebarProps {
  locale: Locale;
  history: HistoryRecord[];
  selectedId?: string | undefined;
  user: User | null;
  onNew: () => void;
  onSelect: (record: HistoryRecord) => void;
  onSignOut: () => Promise<void>;
}

export const Sidebar = ({ locale, history, selectedId, user, onNew, onSelect, onSignOut }: SidebarProps) => {
  const t = copy[locale];

  return (
    <aside className="flex h-screen w-[308px] shrink-0 flex-col border-r border-app-border/70 bg-app-panel/72 p-4 backdrop-blur-2xl">
      <div className="mb-4 flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-card bg-app-text text-app-bg">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold text-app-text">{t.appName}</h1>
          <p className="text-xs text-app-muted">Gladia · Supabase · Tauri</p>
        </div>
      </div>

      <button
        className="mb-4 inline-flex h-11 items-center justify-center gap-2 rounded-full border border-app-border/80 bg-app-panel-strong/70 text-sm font-semibold text-app-text shadow-soft transition hover:bg-app-panel-strong"
        type="button"
        onClick={onNew}
      >
        <Plus className="h-4 w-4" />
        {t.newTranscript}
      </button>

      <div className="mb-2 px-1 text-xs uppercase tracking-[0.18em] text-app-muted">{t.history}</div>
      <div className="flex-1 space-y-2 overflow-y-auto pr-1">
        {history.length ? (
          history.map((record) => {
            const id = record.id ?? record.createdAt;
            return (
              <button
                key={id}
                className={`w-full rounded-card border px-3 py-3 text-left transition ${
                  selectedId === id
                    ? "border-app-border bg-app-panel-strong text-app-text shadow-soft"
                    : "border-transparent text-app-muted hover:border-app-border/70 hover:bg-app-panel-strong/50 hover:text-app-text"
                }`}
                type="button"
                onClick={() => onSelect(record)}
              >
                <span className="flex items-start gap-3">
                  <FileText className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{record.title}</span>
                    <span className="mt-1 block text-xs">
                      {new Date(record.createdAt).toLocaleDateString(locale === "ru" ? "ru-RU" : "en-US")} · {record.status}
                    </span>
                  </span>
                </span>
              </button>
            );
          })
        ) : (
          <p className="rounded-card border border-dashed border-app-border/80 p-4 text-sm leading-6 text-app-muted">{t.emptyHistory}</p>
        )}
      </div>

      <div className="mt-4 rounded-card border border-app-border/80 bg-app-panel-strong/54 p-3">
        <p className="truncate text-sm font-semibold text-app-text">{user?.email ?? t.authTitle}</p>
        <p className="mt-1 text-xs text-app-muted">{user ? t.signedIn : "Supabase magic link"}</p>
        {user ? (
          <button className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-app-muted hover:text-app-text" type="button" onClick={() => void onSignOut()}>
            <LogOut className="h-3.5 w-3.5" />
            {t.signOut}
          </button>
        ) : null}
      </div>
    </aside>
  );
};
