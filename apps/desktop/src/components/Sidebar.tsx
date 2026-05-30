import type { User } from "@supabase/supabase-js";
import type { HistoryRecord } from "@transcriber/core";
import { Cloud, FileText, LogOut, Plus } from "lucide-react";
import type { Locale } from "../lib/i18n";
import { copy } from "../lib/i18n";

interface SidebarProps {
  locale: Locale;
  history: HistoryRecord[];
  selectedId?: string | undefined;
  user: User | null;
  isAccountlessMode: boolean;
  onNew: () => void;
  onSelect: (record: HistoryRecord) => void;
  onSignOut: () => Promise<void>;
}

export const Sidebar = ({ locale, history, selectedId, user, isAccountlessMode, onNew, onSelect, onSignOut }: SidebarProps) => {
  const t = copy[locale];
  const today = new Date().toDateString();
  const todayRecords = history.filter((record) => new Date(record.createdAt).toDateString() === today);
  const earlierRecords = history.filter((record) => new Date(record.createdAt).toDateString() !== today);

  const renderRecord = (record: HistoryRecord) => {
    const id = record.id ?? record.createdAt;

    return (
      <button
        key={id}
        className={`w-full rounded-xl px-3 py-3 text-left transition ${
          selectedId === id
            ? "bg-app-panel-strong text-app-text shadow-soft"
            : "text-app-muted hover:bg-app-panel-strong/50 hover:text-app-text"
        }`}
        type="button"
        onClick={() => onSelect(record)}
      >
        <span className="flex items-start gap-3">
          <FileText className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{record.title}</span>
            <span className="mt-1 flex items-center gap-1.5 text-xs">
              {record.storage === "cloud" ? <Cloud className="h-3 w-3" /> : null}
              <span>{new Date(record.createdAt).toLocaleDateString(locale === "ru" ? "ru-RU" : "en-US")} · {record.status}</span>
            </span>
          </span>
        </span>
      </button>
    );
  };

  const renderGroup = (label: string, records: HistoryRecord[]) =>
    records.length ? (
      <section className="space-y-2">
        <div className="px-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-app-muted">{label}</div>
        {records.map(renderRecord)}
      </section>
    ) : null;

  return (
    <aside className="flex h-screen w-[300px] shrink-0 flex-col border-r border-app-border/60 bg-app-panel/86 p-4">
      <div className="mb-4 px-1">
        <p className="text-sm font-semibold text-app-text">{t.appName}</p>
        <p className="text-xs text-app-muted">History</p>
      </div>

      <button
        className="mb-4 inline-flex h-11 items-center justify-center gap-2 rounded-full border border-app-border/70 bg-app-panel-strong/70 text-sm font-semibold text-app-text transition hover:bg-app-panel-strong"
        type="button"
        onClick={onNew}
      >
        <Plus className="h-4 w-4" />
        {t.newTranscript}
      </button>

      <div className="flex-1 space-y-5 overflow-y-auto pr-1">
        {history.length ? (
          <>
            {renderGroup("TODAY", todayRecords)}
            {renderGroup("EARLIER", earlierRecords)}
          </>
        ) : (
          <p className="rounded-xl border border-dashed border-app-border/80 p-4 text-sm leading-6 text-app-muted">{t.emptyHistory}</p>
        )}
      </div>

      <div className="mt-4 rounded-xl border border-app-border/70 bg-app-panel-strong/46 p-3">
        <p className="truncate text-sm font-semibold text-app-text">{isAccountlessMode ? "Demo mode" : user?.email ?? t.authTitle}</p>
        <p className="mt-1 text-xs text-app-muted">{isAccountlessMode ? "Local session" : user ? t.signedIn : "Supabase magic link"}</p>
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
