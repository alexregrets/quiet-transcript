import { buildMarkdown, describeUrlSupport, fromHistoryRow, markdownFilename, titleFromSource, toHistoryInsert, type HistoryRecord, type SupabaseHistoryRow } from "@transcriber/core";
import type { User } from "@supabase/supabase-js";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useEffect, useMemo, useRef, useState } from "react";
import { LanguageToggle } from "./components/LanguageToggle";
import { MainView } from "./components/MainView";
import { ProcessingView } from "./components/ProcessingView";
import { ResultView } from "./components/ResultView";
import { Sidebar } from "./components/Sidebar";
import { ThemeToggle, type AppTheme } from "./components/ThemeToggle";
import { getEnvHealthCheck, getPendingAuthDeepLinks, transcribeFileOnDesktop, transcribeFilePathOnDesktop, transcribeUrlOnDesktop } from "./lib/desktopBridge";
import { copy, type Locale, stepKeys } from "./lib/i18n";
import { hasSupabaseConfig, supabase } from "./lib/supabase";

const HISTORY_STORAGE_KEY = "quiet-transcript-history";
const THEME_STORAGE_KEY = "quiet-transcript-theme";
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";
const appThemes = new Set<AppTheme>(["light", "dark", "blue", "sepia"]);
const AUTH_REDIRECT_URL = "quiet-transcript://auth";
const supportedDropExtensions = new Set(["mp3", "wav", "m4a", "mp4", "mov", "webm", "ogg"]);

interface AuthDeepLinkPayload {
  url: string;
}

const filenameFromPath = (path: string) => path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;

const isSupportedDropPath = (path: string) => {
  const extension = filenameFromPath(path).split(".").at(-1)?.toLowerCase();
  return extension ? supportedDropExtensions.has(extension) : false;
};

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
  const [activeStep, setActiveStep] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const [isWindowDragOver, setIsWindowDragOver] = useState(false);
  const processingRef = useRef(false);
  const t = copy[locale];

  const selectedId = selected?.id ?? selected?.createdAt;
  const stepLabels = useMemo(() => stepKeys.map((key) => t[key]), [t]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }

    void getEnvHealthCheck()
      .then((report) => {
        if (report) {
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
        setHistory(records);
        setSelected(records[0] ?? null);
      });
  }, [accountlessMode, user]);

  useEffect(() => {
    if (!user || accountlessMode) {
      saveLocalHistory(history.filter((record) => record.storage !== "cloud"));
    }
  }, [accountlessMode, history, user]);

  useEffect(() => {
    processingRef.current = processing;
  }, [processing]);

  useEffect(() => {
    if (!processing) {
      return;
    }

    const timer = window.setInterval(() => {
      setActiveStep((current) => Math.min(current + 1, stepKeys.length - 2));
    }, 1800);

    return () => window.clearInterval(timer);
  }, [processing]);

  useEffect(() => {
    if (!processing) {
      return;
    }

    const label = stepLabels[activeStep];
    if (!label) {
      return;
    }

    setLog((current) => {
      const next = `${new Date().toLocaleTimeString()} · ${label}`;
      return current.at(-1)?.endsWith(label) ? current : [...current, next].slice(-8);
    });
  }, [activeStep, processing, stepLabels]);

  const addRecord = (record: HistoryRecord) => {
    setHistory((current) => [record, ...current.filter((item) => (item.id ?? item.createdAt) !== (record.id ?? record.createdAt))]);
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

  const startLog = (label: string) => {
    setError(undefined);
    setProcessing(true);
    setActiveStep(0);
    setLog([`${new Date().toLocaleTimeString()} · ${label}`]);
  };

  const finishWithPayload = async (payload: { result: Omit<HistoryRecord, "status" | "markdown">; markdown: string }) => {
    const record: HistoryRecord = {
      ...payload.result,
      status: "done",
      markdown: payload.markdown,
      storage: user && !accountlessMode ? "cloud" : "local"
    };
    const savedRecord = user && !accountlessMode ? await saveRecordToSupabase(record) : record;
    setActiveStep(stepKeys.length - 1);
    setLog((current) => [...current, `${new Date().toLocaleTimeString()} · ${t.done}`]);
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

  const runFile = async (file: File) => {
    startLog(file.name);

    try {
      if (DEMO_MODE) {
        const record = createDemoRecord({ kind: "file", filename: file.name, mimeType: file.type, sizeBytes: file.size });
        await finishWithPayload({
          result: record,
          markdown: record.markdown
        });
        return;
      }

      const payload = await transcribeFileOnDesktop(file);
      await finishWithPayload(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setProcessing(false);
    }
  };

  const runFilePath = async (path: string) => {
    const filename = filenameFromPath(path);
    startLog(filename);

    try {
      if (DEMO_MODE) {
        const record = createDemoRecord({ kind: "file", filename, sizeBytes: 0 });
        await finishWithPayload({
          result: record,
          markdown: record.markdown
        });
        return;
      }

      const payload = await transcribeFilePathOnDesktop(path);
      await finishWithPayload(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setProcessing(false);
    }
  };

  const runUrl = async () => {
    const support = describeUrlSupport(url);
    if (support === "invalid") {
      setError("Enter a valid http or https URL.");
      return;
    }

    if (support === "extractor-required") {
      setError("MVP supports direct media URLs first. YouTube/page extraction is isolated as the next source extractor.");
      return;
    }

    startLog(url);

    try {
      if (DEMO_MODE) {
        const record = createDemoRecord({ kind: "url", url });
        await finishWithPayload({ result: record, markdown: record.markdown });
        return;
      }

      const payload = await transcribeUrlOnDesktop(url);
      await finishWithPayload(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setProcessing(false);
    }
  };

  const signIn = async () => {
    if (!supabase) {
      setAuthMessage("Add Supabase URL and anon key to enable email login.");
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

    setAuthMessage(signInError ? signInError.message : "Check your email for the magic link.");
  };

  useEffect(() => {
    let isMounted = true;
    let unlistenDragDrop: (() => void) | undefined;

    const setupDragDrop = async () => {
      try {
        const unlisten = await getCurrentWebview().onDragDropEvent((event) => {
          if (event.payload.type === "drop") {
            setIsWindowDragOver(false);

            if (processingRef.current) {
              return;
            }

            const paths = event.payload.paths;
            const firstSupportedPath = paths.find(isSupportedDropPath);

            if (!firstSupportedPath) {
              setError("Please drop an MP3, WAV, M4A, MP4, MOV, WEBM, or OGG file.");
              return;
            }

            void runFilePath(firstSupportedPath);
            return;
          }

          if (event.payload.type === "enter" || event.payload.type === "over") {
            if (!processingRef.current) {
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
          setAuthMessage(sessionError ? sessionError.message : "Signed in.");
          return;
        }

        if (code) {
          const { error: exchangeError } = await supabaseClient.auth.exchangeCodeForSession(code);
          setAuthMessage(exchangeError ? exchangeError.message : "Signed in.");
          return;
        }

        setAuthMessage("Auth link did not include a Supabase session token.");
      } catch (cause) {
        setAuthMessage(cause instanceof Error ? cause.message : "Could not complete email login.");
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
      setAuthMessage("Saved.");
      return;
    }

    if (!supabase || !user) {
      setAuthMessage("Sign in with Supabase before saving cloud history.");
      return;
    }

    const savedRecord = await saveRecordToSupabase(selected);
    addRecord(savedRecord);
    setAuthMessage(savedRecord.storage === "cloud" ? "Saved." : "Could not save cloud history.");
  };

  const copyMarkdown = async () => {
    if (selected) {
      await navigator.clipboard.writeText(selected.markdown);
    }
  };

  const downloadMarkdown = () => {
    if (!selected) {
      return;
    }

    const blob = new Blob([selected.markdown], { type: "text/markdown;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = markdownFilename(selected.title);
    anchor.click();
    URL.revokeObjectURL(href);
  };

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
          error={error}
          locale={locale}
          showAuth
          url={url}
          onAuthSubmit={signIn}
          onConsentChange={setMarketingConsent}
          onEmailChange={setEmail}
          onContinueWithoutAccount={continueWithoutAccount}
          onFileSelect={(file) => void runFile(file)}
          onUrlChange={setUrl}
          onUrlSubmit={() => void runUrl()}
        />
      </div>
    );
  }

  return (
    <div className="app-surface flex min-h-screen text-app-text">
      {isWindowDragOver ? (
        <div className="pointer-events-none fixed inset-4 z-50 grid place-items-center rounded-[32px] border border-app-accent/70 bg-app-panel/80 text-lg font-semibold text-app-text shadow-lift backdrop-blur-xl">
          Drop audio or video file
        </div>
      ) : null}
      <Sidebar
        history={history}
        locale={locale}
        selectedId={selectedId}
        user={user}
        isAccountlessMode={accountlessMode}
        onNew={startNewTranscript}
        onSelect={setSelected}
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
            </div>
          </header>

          <div className="flex flex-1 items-center">
            {processing ? (
              <ProcessingView activeStep={activeStep} locale={locale} log={log.length ? log : stepLabels} />
            ) : selected ? (
              <ResultView
                locale={locale}
                record={selected}
                onCopy={() => void copyMarkdown()}
                onDownload={downloadMarkdown}
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
                error={error}
                locale={locale}
                showAuth={false}
                url={url}
                onAuthSubmit={signIn}
                onConsentChange={setMarketingConsent}
                onEmailChange={setEmail}
                onContinueWithoutAccount={continueWithoutAccount}
                onFileSelect={(file) => void runFile(file)}
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
