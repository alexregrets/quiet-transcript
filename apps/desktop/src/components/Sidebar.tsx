import type { User } from "@supabase/supabase-js";
import type { HistoryRecord } from "@transcriber/core";
import { ChevronLeft, ChevronRight, Cloud, FileText, LogOut, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
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
  onDelete: (record: HistoryRecord) => void;
  onSignOut: () => Promise<void>;
}

export const Sidebar = ({ locale, history, selectedId, user, isAccountlessMode, onNew, onSelect, onDelete, onSignOut }: SidebarProps) => {
  const t = copy[locale];
  const [collapsed, setCollapsed] = useState(false);
  const today = new Date().toDateString();
  const todayRecords = history.filter((record) => new Date(record.createdAt).toDateString() === today);
  const earlierRecords = history.filter((record) => new Date(record.createdAt).toDateString() !== today);

  const renderRecord = (record: HistoryRecord) => {
    const id = record.id ?? record.createdAt;

    if (collapsed) {
      return (
        <button
          key={id}
          title={record.title}
          className={`flex w-full items-center justify-center rounded-xl p-2.5 transition ${
            selectedId === id
              ? "bg-app-panel-strong text-app-text shadow-soft"
              : "text-app-muted hover:bg-app-panel-strong/50 hover:text-app-text"
          }`}
          type="button"
          onClick={() => onSelect(record)}
        >
          <FileText className="h-4 w-4 shrink-0" />
        </button>
      );
    }

    return (
      <div
        key={id}
        className={`group relative rounded-xl transition ${
          selectedId === id
            ? "bg-app-panel-strong text-app-text shadow-soft"
            : "text-app-muted hover:bg-app-panel-strong/50 hover:text-app-text"
        }`}
      >
        <button className="w-full px-3 py-2.5 text-left" type="button" onClick={() => onSelect(record)}>
          <span className="flex items-start gap-2.5">
            <FileText className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="min-w-0">
              <span className="block truncate pr-6 text-sm font-medium">{record.title}</span>
              <span className="mt-0.5 flex items-center gap-1.5 text-xs text-app-muted/70">
                {record.storage === "cloud" ? <Cloud className="h-3 w-3" /> : null}
                <span>{new Date(record.createdAt).toLocaleDateString(locale === "ru" ? "ru-RU" : "en-US")}</span>
              </span>
            </span>
          </span>
        </button>
        <button
          className="absolute right-2 top-2.5 hidden rounded-lg p-1 text-app-muted transition hover:text-red-500 group-hover:block"
          title={t.deleteRecord}
          type="button"
          onClick={() => onDelete(record)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  };

  const renderGroup = (label: string, records: HistoryRecord[]) =>
    records.length ? (
      <section className="space-y-1">
        {!collapsed && (
          <div className="px-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-app-muted/60">{label}</div>
        )}
        {records.map(renderRecord)}
      </section>
    ) : null;

  return (
    <aside
      className="relative flex h-screen shrink-0 flex-col border-r border-app-border/60 bg-app-panel/86 transition-all duration-200"
      style={{ width: collapsed ? "60px" : "260px" }}
    >
      {/* Toggle button */}
      <button
        className="absolute -right-3 top-6 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-app-border/70 bg-app-panel-strong text-app-muted shadow-soft transition hover:text-app-text"
        type="button"
        onClick={() => setCollapsed((c) => !c)}
      >
        {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
      </button>

      <div className={`p-3 ${collapsed ? "px-2" : "p-4"}`}>
        {!collapsed && (
          <div className="mb-3 px-1">
            <p className="text-sm font-semibold text-app-text">{t.appName}</p>
            <p className="text-xs text-app-muted/70">{t.historyLabel}</p>
          </div>
        )}

        <button
          className={`inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-app-border/70 bg-app-panel-strong/70 text-sm font-semibold text-app-text transition hover:bg-app-panel-strong ${collapsed ? "px-0" : "px-3"}`}
          type="button"
          title={t.newTranscript}
          onClick={onNew}
        >
          <Plus className="h-4 w-4 shrink-0" />
          {!collapsed && t.newTranscript}
        </button>
      </div>

      <div className={`flex-1 space-y-4 overflow-y-auto ${collapsed ? "px-2" : "px-3"}`}>
        {history.length ? (
          <>
            {renderGroup(t.historyToday, todayRecords)}
            {renderGroup(t.historyEarlier, earlierRecords)}
          </>
        ) : !collapsed ? (
          <p className="rounded-xl border border-dashed border-app-border/80 p-4 text-sm leading-6 text-app-muted">{t.emptyHistory}</p>
        ) : null}
      </div>

      {!collapsed && (
        <div className={`m-3 rounded-xl border border-app-border/70 bg-app-panel-strong/46 p-3`}>
          <p className="truncate text-sm font-semibold text-app-text">{isAccountlessMode ? t.demoSession : user?.email ?? t.authTitle}</p>
          <p className="mt-0.5 text-xs text-app-muted/70">{isAccountlessMode ? t.localSession : user ? t.signedIn : t.magicLinkHint}</p>
          {user ? (
            <button className="mt-2.5 inline-flex items-center gap-2 text-xs font-semibold text-app-muted hover:text-app-text" type="button" onClick={() => void onSignOut()}>
              <LogOut className="h-3.5 w-3.5" />
              {t.signOut}
            </button>
          ) : null}
        </div>
      )}

      {collapsed && user && (
        <div className="mb-3 flex justify-center">
          <button className="flex h-8 w-8 items-center justify-center rounded-xl text-app-muted hover:text-app-text" title={t.signOut} type="button" onClick={() => void onSignOut()}>
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </aside>
  );
};
