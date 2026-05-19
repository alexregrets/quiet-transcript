import { buildMarkdown, describeUrlSupport, markdownFilename, titleFromSource, type HistoryRecord } from "@transcriber/core";
import type { User } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";
import { LanguageToggle } from "./components/LanguageToggle";
import { MainView } from "./components/MainView";
import { ProcessingView } from "./components/ProcessingView";
import { ResultView } from "./components/ResultView";
import { Sidebar } from "./components/Sidebar";
import { ThemeToggle } from "./components/ThemeToggle";
import { getEnvHealthCheck, transcribeFileOnDesktop, transcribeUrlOnDesktop } from "./lib/desktopBridge";
import { copy, type Locale, stepKeys } from "./lib/i18n";
import { hasSupabaseConfig, supabase } from "./lib/supabase";

const HISTORY_STORAGE_KEY = "quiet-transcript-history";
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";

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
    markdown: buildMarkdown(result)
  };
};

export const App = () => {
  const [locale, setLocale] = useState<Locale>("ru");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [email, setEmail] = useState("");
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [authMessage, setAuthMessage] = useState<string>();
  const [user, setUser] = useState<User | null>(null);
  const [url, setUrl] = useState("");
  const [history, setHistory] = useState<HistoryRecord[]>(() => loadLocalHistory());
  const [selected, setSelected] = useState<HistoryRecord | null>(history[0] ?? null);
  const [processing, setProcessing] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const t = copy[locale];

  const selectedId = selected?.id ?? selected?.createdAt;
  const stepLabels = useMemo(() => stepKeys.map((key) => t[key]), [t]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
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
    saveLocalHistory(history);
  }, [history]);

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

  const startLog = (label: string) => {
    setError(undefined);
    setProcessing(true);
    setActiveStep(0);
    setLog([`${new Date().toLocaleTimeString()} · ${label}`]);
  };

  const finishWithPayload = (payload: { result: Omit<HistoryRecord, "status" | "markdown">; markdown: string }) => {
    const record: HistoryRecord = {
      ...payload.result,
      status: "done",
      markdown: payload.markdown
    };
    setActiveStep(stepKeys.length - 1);
    setLog((current) => [...current, `${new Date().toLocaleTimeString()} · ${t.done}`]);
    addRecord(record);
  };

  const startNewTranscript = () => {
    setSelected(null);
    setError(undefined);
    setUrl("");
  };

  const runFile = async (file: File) => {
    startLog(file.name);

    try {
      if (DEMO_MODE) {
        const record = createDemoRecord({ kind: "file", filename: file.name, mimeType: file.type, sizeBytes: file.size });
        finishWithPayload({
          result: record,
          markdown: record.markdown
        });
        return;
      }

      const payload = await transcribeFileOnDesktop(file);
      finishWithPayload(payload);
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
        finishWithPayload({ result: record, markdown: record.markdown });
        return;
      }

      const payload = await transcribeUrlOnDesktop(url);
      finishWithPayload(payload);
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
        emailRedirectTo: window.location.origin,
        data: {
          marketing_consent: marketingConsent
        }
      }
    });

    setAuthMessage(signInError ? signInError.message : "Check your email for the magic link.");
  };

  const signOut = async () => {
    await supabase?.auth.signOut();
    setUser(null);
  };

  const saveToSupabase = async () => {
    if (!selected) {
      return;
    }

    if (!supabase || !user) {
      setAuthMessage("Sign in with Supabase before saving cloud history.");
      return;
    }

    const { error: profileError } = await supabase.from("profiles").upsert({
      id: user.id,
      email: user.email,
      marketing_consent: marketingConsent
    });

    if (profileError) {
      setAuthMessage(profileError.message);
      return;
    }

    const { error: insertError } = await supabase.from("transcriptions").insert({
      user_id: user.id,
      title: selected.title,
      source_kind: selected.source.kind,
      source_value: selected.source.kind === "file" ? selected.source.filename : selected.source.url,
      status: selected.status,
      language: selected.language ?? null,
      duration_seconds: selected.durationSeconds ?? null,
      markdown: selected.markdown,
      transcript_text: selected.text,
      provider: selected.provider
    });

    setAuthMessage(insertError ? insertError.message : "Saved.");
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

  return (
    <div className="app-surface flex min-h-screen text-app-text">
      <Sidebar
        history={history}
        locale={locale}
        selectedId={selectedId}
        user={user}
        onNew={startNewTranscript}
        onSelect={setSelected}
        onSignOut={signOut}
      />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="flex min-h-screen flex-col px-7 py-5">
          <header className="mb-8 flex items-center justify-end gap-2">
            <LanguageToggle locale={locale} onToggle={() => setLocale(locale === "ru" ? "en" : "ru")} />
            <ThemeToggle theme={theme} onToggle={() => setTheme(theme === "dark" ? "light" : "dark")} />
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
                showAuth={!user}
                url={url}
                onAuthSubmit={signIn}
                onConsentChange={setMarketingConsent}
                onEmailChange={setEmail}
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
