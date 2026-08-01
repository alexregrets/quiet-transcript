import {
  buildMarkdown,
  describeUrlSupport,
  fromHistoryRow,
  isSupportedMediaFilename,
  markdownFilename,
  titleFromSource,
  toHistoryInsert,
  type HistoryRecord,
  type SupabaseHistoryRow
} from "@transcriber/core";
import type { User } from "@supabase/supabase-js";
import { listen } from "@tauri-apps/api/event";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { downloadDir, join } from "@tauri-apps/api/path";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { Minimize2, Settings } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LanguageToggle } from "./components/LanguageToggle";
import { MainView } from "./components/MainView";
import { MiniView } from "./components/MiniView";
import { ProcessingView } from "./components/ProcessingView";
import { ResultView } from "./components/ResultView";
import { SettingsView } from "./components/SettingsView";
import { Sidebar } from "./components/Sidebar";
import { ThemeToggle, type AppTheme } from "./components/ThemeToggle";
import { loadGladiaKey } from "./lib/apiKey";
import {
  getEnvHealthCheck,
  getPendingAuthDeepLinks,
  listenToTranscriptionProgress,
  pickMediaFile,
  transcribeFilePathOnDesktop,
  transcribeUrlOnDesktop
} from "./lib/desktopBridge";
import { describeError } from "./lib/errors";
import { copy, stepKeys, type Locale, type StepKey } from "./lib/i18n";
import { hasSupabaseConfig, supabase } from "./lib/supabase";

const HISTORY_STORAGE_KEY = "quiet-transcript-history";
const THEME_STORAGE_KEY = "quiet-transcript-theme";
const MINI_MODE_STORAGE_KEY = "quiet-transcript-mini-mode";
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";
const appThemes = new Set<AppTheme>(["light", "dark", "blue", "sepia"]);
const AUTH_REDIRECT_URL = "quiet-transcript://auth";

interface AuthDeepLinkPayload {
  url: string;
}

export type LogEntry = { time: string; stage: StepKey } | { time: string; source: string };

const filenameFromPath = (path: string) => path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;

const now = () => new Date().toLocaleTimeString();

const loadLocalHistory = () => {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as HistoryRecord[]) : [];
  } catch {
    return [];
  }
};

const saveLocalHistory = (records: HistoryRecord[]) => {
  localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(records.slice(0, 50)));
};

const createDemoRecord = (source: HistoryRecord["source"]): HistoryRecord => {
  const result = {
    id: crypto.randomUUID(),
    title: titleFromSource(source),
    source,
    language: "en",
    durationSeconds: 84,
    createdAt: new Date().toISOString(),
    text: "Demo mode transcript. Disable VITE_DEMO_MODE and set GLADIA_API_KEY to run a real Gladia transcription.",
    provider: "demo"
  };

  return {
    ...result,
    status: "done",
    markdown: buildMarkdown(result),
    storage: "local"
  };
};

const recordKey = (record: HistoryRecord) => record.id ?? record.createdAt;

export const App = () => {
  const [locale, setLocale] = useState<Locale>("ru");
  const [theme, setTheme] = useState<AppTheme>(() => {
    const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    return appThemes.has(storedTheme as AppTheme) ? (storedTheme as AppTheme) : "dark";
  });
  const [email, setEmail] = useState("");
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [accountlessMode, setAccountlessMode] = useState(false);
  const [authMessage, setAuthMessage] = useState<string>();
  const [user, setUser] = useState<User | null>(null);
  const [url, setUrl] = useState("");
  const [history, setHistory] = useState<HistoryRecord[]>(() => loadLocalHistory());
  const [selected, setSelected] = useState<HistoryRecord | null>(history[0] ?? null);
  const [processing, setProcessing] = useState(false);
  const [steps, setSteps] = useState<StepKey[]>([...stepKeys]);
  const [stage, setStage] = useState<StepKey>("uploading");
  const [log, setLog] = useState<LogEntry[]>([]);
  // Kept as a raw value rather than a rendered string, so switching language also
  // re-translates the error already on screen.
  const [error, setError] = useState<unknown>();
  const [notice, setNotice] = useState<string>();
  const [isWindowDragOver, setIsWindowDragOver] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isMiniMode, setIsMiniMode] = useState(() => localStorage.getItem(MINI_MODE_STORAGE_KEY) === "true");
  const [showSettings, setShowSettings] = useState(false);
  const [gladiaKey, setGladiaKey] = useState(() => loadGladiaKey());
  const [envKeyPresent, setEnvKeyPresent] = useState(false);
  const t = copy[locale];

  const selectedId = selected ? recordKey(selected) : undefined;
  const activeStep = Math.max(steps.indexOf(stage), 0);
  const errorMessage = error === undefined ? undefined : describeError(error, locale);
  // Production builds ship no .env, so without a saved key there is nothing to transcribe with.
  const needsApiKey = !DEMO_MODE && !gladiaKey && !envKeyPresent;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  // Runs in every build: production has no .env, so this is what tells us whether
  // the user must supply their own key before transcription can work at all.
  useEffect(() => {
    void getEnvHealthCheck()
      .then((report) => {
        if (!report) {
          return;
        }

        setEnvKeyPresent(report.gladia_key_present);

        if (import.meta.env.DEV) {
          console.info("[env] health check", report);
        }
      })
      .catch((cause) => {
        console.warn("[env] health check failed", cause);
      });
  }, []);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    void supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !user || accountlessMode) {
      return;
    }

    const supabaseClient = supabase;

    void supabaseClient
      .from("transcriptions")
      .select("id,user_id,title,source_kind,source_value,status,language,duration_seconds,markdown,transcript_text,provider,created_at")
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data, error: loadError }) => {
        if (loadError) {
          setAuthMessage(loadError.message);
          return;
        }

        const records = ((data ?? []) as SupabaseHistoryRow[]).map(fromHistoryRow);
        // Local transcripts stay visible after signing in; cloud copies win on id.
        const cloudIds = new Set(records.map(recordKey));
        const localOnly = loadLocalHistory().filter((record) => !cloudIds.has(recordKey(record)));
        const merged = [...records, ...localOnly].sort((left, right) =>
          right.createdAt.localeCompare(left.createdAt)
        );

        setHistory(merged);
        setSelected(merged[0] ?? null);
      });
  }, [accountlessMode, user]);

  useEffect(() => {
    saveLocalHistory(history.filter((record) => record.storage !== "cloud"));
  }, [history]);

  // Real stage updates from Rust replace what used to be a timer guessing progress.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let isMounted = true;

    void listenToTranscriptionProgress((nextStage) => {
      setStage(nextStage);
      setLog((current) => [...current, { time: now(), stage: nextStage }].slice(-8));
    })
      .then((dispose) => {
        if (isMounted) {
          unlisten = dispose;
        } else {
          dispose();
        }
      })
      .catch((cause) => console.warn("Failed to listen for transcription progress.", cause));

    return () => {
      isMounted = false;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(() => setNotice(undefined), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const addRecord = (record: HistoryRecord) => {
    setHistory((current) => [record, ...current.filter((item) => recordKey(item) !== recordKey(record))]);
    setSelected(record);
  };

  const saveRecordToSupabase = async (record: HistoryRecord) => {
    if (!supabase || !user || accountlessMode) {
      return record;
    }

    const { error: profileError } = await supabase.from("profiles").upsert({
      id: user.id,
      email: user.email,
      marketing_consent: marketingConsent
    });

    if (profileError) {
      setAuthMessage(profileError.message);
      return { ...record, storage: "local" as const };
    }

    const { data, error: insertError } = await supabase
      .from("transcriptions")
      .insert(toHistoryInsert(user.id, record))
      .select("id,user_id,title,source_kind,source_value,status,language,duration_seconds,markdown,transcript_text,provider,created_at")
      .single();

    if (insertError) {
      setAuthMessage(insertError.message);
      return { ...record, storage: "local" as const };
    }

    return fromHistoryRow(data as SupabaseHistoryRow);
  };

  const startLog = (label: string, needsExtraction: boolean) => {
    const nextSteps = needsExtraction ? [...stepKeys] : stepKeys.filter((key) => key !== "extracting");

    setError(undefined);
    setProcessing(true);
    setSteps(nextSteps);
    setStage(nextSteps[0] ?? "uploading");
    setLog([{ time: now(), source: label }]);
  };

  const finishWithPayload = async (payload: { result: Omit<HistoryRecord, "status" | "markdown">; markdown: string }) => {
    const record: HistoryRecord = {
      ...payload.result,
      status: "done",
      markdown: payload.markdown,
      storage: user && !accountlessMode ? "cloud" : "local"
    };
    const savedRecord = user && !accountlessMode ? await saveRecordToSupabase(record) : record;
    setStage("done");
    addRecord(savedRecord);
  };

  const startNewTranscript = () => {
    setSelected(null);
    setError(undefined);
    setUrl("");
  };

  const continueWithoutAccount = () => {
    const localRecords = loadLocalHistory();
    setAccountlessMode(true);
    setHistory(localRecords);
    setSelected(localRecords[0] ?? null);
  };

  /** Sends the user to Settings instead of letting the request fail deep in Rust. */
  const ensureApiKey = useCallback(() => {
    if (!needsApiKey) {
      return true;
    }

    setError({ code: "no_api_key" });
    setShowSettings(true);
    return false;
  }, [needsApiKey]);

  const runFilePath = useCallback(
    async (path: string) => {
      if (!ensureApiKey()) {
        return;
      }

      const filename = filenameFromPath(path);
      startLog(filename, false);

      try {
        if (DEMO_MODE) {
          const record = createDemoRecord({ kind: "file", filename, sizeBytes: 0 });
          await finishWithPayload({ result: record, markdown: record.markdown });
          return;
        }

        const payload = await transcribeFilePathOnDesktop(path);
        await finishWithPayload(payload);
      } catch (cause) {
        setError(cause);
      } finally {
        setProcessing(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ensureApiKey, accountlessMode, marketingConsent, user]
  );

  const pickFile = async () => {
    if (!ensureApiKey()) {
      return;
    }

    try {
      const path = await pickMediaFile();
      if (path) {
        await runFilePath(path);
      }
    } catch (cause) {
      setError(cause);
    }
  };

  const runUrl = async () => {
    const support = describeUrlSupport(url);
    if (support === "invalid") {
      setError({ code: "invalid_url" });
      return;
    }

    if (!ensureApiKey()) {
      return;
    }

    startLog(url, support === "extractor-required");

    try {
      if (DEMO_MODE) {
        const record = createDemoRecord({ kind: "url", url });
        await finishWithPayload({ result: record, markdown: record.markdown });
        return;
      }

      const payload = await transcribeUrlOnDesktop(url);
      await finishWithPayload(payload);
    } catch (cause) {
      setError(cause);
    } finally {
      setProcessing(false);
    }
  };

  const signIn = async () => {
    if (!supabase) {
      setAuthMessage(t.authSupabaseMissing);
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: AUTH_REDIRECT_URL,
        data: {
          marketing_consent: marketingConsent
        }
      }
    });

    setAuthMessage(signInError ? signInError.message : t.authCheckEmail);
  };

  // The listener is registered once, so it must reach the current handlers through a ref.
  // Reading them from the closure would pin them to the first render — which is how
  // dropped files used to skip cloud history entirely.
  const dropHandlersRef = useRef({ runFilePath, processing });
  useEffect(() => {
    dropHandlersRef.current = { runFilePath, processing };
  }, [processing, runFilePath]);

  useEffect(() => {
    let isMounted = true;
    let unlistenDragDrop: (() => void) | undefined;

    const setupDragDrop = async () => {
      try {
        const unlisten = await getCurrentWebview().onDragDropEvent((event) => {
          if (event.payload.type === "drop") {
            setIsWindowDragOver(false);

            if (dropHandlersRef.current.processing) {
              return;
            }

            const firstSupportedPath = event.payload.paths.find((path) =>
              isSupportedMediaFilename(filenameFromPath(path))
            );

            if (!firstSupportedPath) {
              setError({ code: "unsupported_extension" });
              return;
            }

            void dropHandlersRef.current.runFilePath(firstSupportedPath);
            return;
          }

          if (event.payload.type === "enter" || event.payload.type === "over") {
            if (!dropHandlersRef.current.processing) {
              setIsWindowDragOver(true);
            }
            return;
          }

          if (event.payload.type === "leave") {
            setIsWindowDragOver(false);
          }
        });

        if (!isMounted) {
          unlisten();
          return;
        }

        unlistenDragDrop = unlisten;
      } catch (cause) {
        console.warn("Failed to register Tauri drag-drop listeners.", cause);
      }
    };

    void setupDragDrop();

    return () => {
      isMounted = false;
      unlistenDragDrop?.();
    };
  }, []);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    const supabaseClient = supabase;

    const completeSessionFromUrl = async (callbackUrl: string) => {
      try {
        const parsed = new URL(callbackUrl);
        const params = new URLSearchParams(parsed.search);
        const hashParams = new URLSearchParams(parsed.hash.startsWith("#") ? parsed.hash.slice(1) : parsed.hash);

        hashParams.forEach((value, key) => params.set(key, value));

        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");
        const code = params.get("code");

        if (accessToken && refreshToken) {
          const { error: sessionError } = await supabaseClient.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          });
          setAuthMessage(sessionError ? sessionError.message : copy[locale].authSignedIn);
          return;
        }

        if (code) {
          const { error: exchangeError } = await supabaseClient.auth.exchangeCodeForSession(code);
          setAuthMessage(exchangeError ? exchangeError.message : copy[locale].authSignedIn);
          return;
        }

        setAuthMessage(copy[locale].authNoToken);
      } catch (cause) {
        setAuthMessage(cause instanceof Error ? cause.message : copy[locale].authFailed);
      }
    };

    let isMounted = true;
    let unlistenAuth: (() => void) | undefined;

    void listen<AuthDeepLinkPayload>("auth-deep-link", (event) => {
      void completeSessionFromUrl(event.payload.url);
    })
      .then((unlisten) => {
        if (isMounted) {
          unlistenAuth = unlisten;
        } else {
          unlisten();
        }
      })
      .catch((cause) => console.warn("Failed to register auth deep-link listener.", cause));

    void getPendingAuthDeepLinks()
      .then((urls) => {
        for (const callbackUrl of urls) {
          void completeSessionFromUrl(callbackUrl);
        }
      })
      .catch((cause) => console.warn("Failed to read pending auth deep links.", cause));

    return () => {
      isMounted = false;
      unlistenAuth?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signOut = async () => {
    await supabase?.auth.signOut();
    setAccountlessMode(false);
    setUser(null);
    const localRecords = loadLocalHistory();
    setHistory(localRecords);
    setSelected(localRecords[0] ?? null);
  };

  const saveToSupabase = async () => {
    if (!selected) {
      return;
    }

    if (selected.storage === "cloud") {
      setNotice(t.saved);
      return;
    }

    if (!supabase || !user) {
      setAuthMessage(t.saveNeedsAccount);
      return;
    }

    const savedRecord = await saveRecordToSupabase(selected);
    addRecord(savedRecord);
    setNotice(savedRecord.storage === "cloud" ? t.saved : t.saveFailed);
  };

  const deleteRecord = async (record: HistoryRecord) => {
    if (record.storage === "cloud" && supabase && record.id) {
      const { error: deleteError } = await supabase.from("transcriptions").delete().eq("id", record.id);

      if (deleteError) {
        setAuthMessage(deleteError.message);
        return;
      }
    }

    setHistory((current) => {
      const next = current.filter((item) => recordKey(item) !== recordKey(record));
      setSelected((currentSelection) =>
        currentSelection && recordKey(currentSelection) === recordKey(record) ? next[0] ?? null : currentSelection
      );
      return next;
    });
  };

  // Uses the Tauri plugin rather than navigator.clipboard, which is unreliable in WebView2.
  const copyMarkdown = async () => {
    if (!selected) {
      return;
    }

    try {
      await writeText(selected.markdown);
    } catch (cause) {
      setError(cause);
      return;
    }

    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadMarkdown = async () => {
    if (!selected) {
      return;
    }

    try {
      const directory = await downloadDir();
      const target = await join(directory, markdownFilename(selected.title));
      await writeTextFile(target, selected.markdown);
      setNotice(`${t.downloadedTo} ${target}`);
    } catch (cause) {
      setError(cause);
    }
  };

  const toggleMiniMode = async () => {
    const nextMini = !isMiniMode;
    setIsMiniMode(nextMini);
    localStorage.setItem(MINI_MODE_STORAGE_KEY, String(nextMini));
    try {
      const win = getCurrentWindow();
      await win.setSize(nextMini ? new LogicalSize(420, 500) : new LogicalSize(1280, 820));
    } catch { /* best-effort resize */ }
  };

  const noticeBanner = notice ? (
    <div className="fixed bottom-5 right-5 z-50 max-w-md rounded-2xl border border-app-border/70 bg-app-panel-strong px-4 py-3 text-xs text-app-text shadow-lift">
      {notice}
    </div>
  ) : null;

  if (!user && !accountlessMode) {
    return (
      <div className="min-h-screen bg-[#f0ede8] text-stone-950">
        <MainView
          authDisabled={!hasSupabaseConfig}
          authMessage={authMessage}
          consent={marketingConsent}
          demoMode={DEMO_MODE}
          disabled={processing}
          email={email}
          error={errorMessage}
          locale={locale}
          showAuth
          url={url}
          onAuthSubmit={signIn}
          onConsentChange={setMarketingConsent}
          onEmailChange={setEmail}
          onContinueWithoutAccount={continueWithoutAccount}
          onPickFile={() => void pickFile()}
          onUrlChange={setUrl}
          onUrlSubmit={() => void runUrl()}
        />
      </div>
    );
  }

  if (isMiniMode) {
    if (showSettings) {
      return (
        <div className="app-surface min-h-screen overflow-y-auto p-4 text-app-text">
          <SettingsView locale={locale} onBack={() => setShowSettings(false)} onKeyChange={setGladiaKey} />
        </div>
      );
    }

    return (
      <>
        <MiniView
          locale={locale}
          url={url}
          disabled={processing}
          processing={processing}
          error={errorMessage}
          selected={selected}
          copied={copied}
          log={log}
          needsApiKey={needsApiKey}
          onUrlChange={setUrl}
          onUrlSubmit={() => void runUrl()}
          onPickFile={() => void pickFile()}
          onCopy={() => void copyMarkdown()}
          onDownload={() => void downloadMarkdown()}
          onSave={() => void saveToSupabase()}
          onNew={startNewTranscript}
          onExpand={() => void toggleMiniMode()}
          onOpenSettings={() => setShowSettings(true)}
        />
        {noticeBanner}
      </>
    );
  }

  return (
    <div className="app-surface flex min-h-screen text-app-text">
      {isWindowDragOver ? (
        <div className="pointer-events-none fixed inset-4 z-50 grid place-items-center rounded-[32px] border border-app-accent/70 bg-app-panel/80 text-lg font-semibold text-app-text shadow-lift backdrop-blur-xl">
          {t.dropOverlay}
        </div>
      ) : null}
      {noticeBanner}
      <Sidebar
        history={history}
        locale={locale}
        selectedId={selectedId}
        user={user}
        isAccountlessMode={accountlessMode}
        onNew={startNewTranscript}
        onSelect={setSelected}
        onDelete={(record) => void deleteRecord(record)}
        onSignOut={signOut}
      />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="flex min-h-screen flex-col px-8 py-5">
          <header className="mb-8 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-app-text text-app-bg">
                <span className="text-sm font-bold">T</span>
              </div>
              <span className="text-sm font-semibold text-app-text">Transcribe.md</span>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle theme={theme} onChange={setTheme} />
              <LanguageToggle locale={locale} onToggle={() => setLocale(locale === "ru" ? "en" : "ru")} />
              <button
                onClick={() => setShowSettings((current) => !current)}
                className={`relative rounded-lg border border-app-border/60 bg-app-panel p-1.5 transition hover:text-app-text ${
                  showSettings ? "text-app-text" : "text-app-muted"
                }`}
                title={t.settings}
              >
                <Settings className="h-4 w-4" />
                {needsApiKey ? (
                  <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-500" />
                ) : null}
              </button>
              <button
                onClick={() => void toggleMiniMode()}
                className="rounded-lg border border-app-border/60 bg-app-panel p-1.5 text-app-muted transition hover:text-app-text"
                title={t.miniMode}
              >
                <Minimize2 className="h-4 w-4" />
              </button>
            </div>
          </header>

          <div className="flex flex-1 items-center">
            {showSettings ? (
              <SettingsView
                locale={locale}
                onBack={() => setShowSettings(false)}
                onKeyChange={setGladiaKey}
              />
            ) : processing ? (
              <ProcessingView activeStep={activeStep} locale={locale} log={log} steps={steps} />
            ) : selected ? (
              <ResultView
                locale={locale}
                record={selected}
                copied={copied}
                onCopy={() => void copyMarkdown()}
                onDownload={() => void downloadMarkdown()}
                onNew={startNewTranscript}
                onSave={() => void saveToSupabase()}
              />
            ) : (
              <MainView
                authDisabled={!hasSupabaseConfig}
                authMessage={authMessage}
                consent={marketingConsent}
                demoMode={DEMO_MODE}
                disabled={processing}
                email={email}
                error={errorMessage}
                locale={locale}
                showAuth={false}
                url={url}
                onAuthSubmit={signIn}
                onConsentChange={setMarketingConsent}
                onEmailChange={setEmail}
                onContinueWithoutAccount={continueWithoutAccount}
                onPickFile={() => void pickFile()}
                onUrlChange={setUrl}
                onUrlSubmit={() => void runUrl()}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
};
