import { Link2, UploadCloud } from "lucide-react";
import { motion } from "framer-motion";
import { InputCard } from "./InputCard";
import { AuthScreen } from "./AuthScreen";
import type { Locale } from "../lib/i18n";
import { copy } from "../lib/i18n";

interface MainViewProps {
  locale: Locale;
  url: string;
  disabled: boolean;
  showAuth: boolean;
  email: string;
  consent: boolean;
  authDisabled: boolean;
  authMessage?: string | undefined;
  error?: string | undefined;
  demoMode: boolean;
  onUrlChange: (value: string) => void;
  onFileSelect: (file: File) => void;
  onUrlSubmit: () => void;
  onEmailChange: (value: string) => void;
  onConsentChange: (value: boolean) => void;
  onAuthSubmit: () => Promise<void>;
}

export const MainView = ({
  locale,
  url,
  disabled,
  showAuth,
  email,
  consent,
  authDisabled,
  authMessage,
  error,
  demoMode,
  onUrlChange,
  onFileSelect,
  onUrlSubmit,
  onEmailChange,
  onConsentChange,
  onAuthSubmit
}: MainViewProps) => {
  const t = copy[locale];

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mx-auto w-full max-w-5xl">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.2em] text-app-muted">Bilingual transcription</p>
        <h2 className="mt-3 max-w-2xl text-[44px] font-semibold leading-[1.04] text-app-text">Quiet, clean Markdown from audio and video.</h2>
      </div>

      {showAuth ? (
        <div className="mb-5 max-w-md">
          <AuthScreen
            consent={consent}
            disabled={authDisabled}
            email={email}
            locale={locale}
            message={authMessage}
            onConsentChange={onConsentChange}
            onEmailChange={onEmailChange}
            onSubmit={onAuthSubmit}
          />
        </div>
      ) : null}

      {demoMode ? <p className="mb-4 rounded-card border border-amber-300/60 bg-amber-100/60 px-4 py-3 text-sm text-amber-900">{t.demoMode}</p> : null}
      {error ? <p className="mb-4 rounded-card border border-red-300/60 bg-red-100/60 px-4 py-3 text-sm text-red-800">{error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <InputCard
          actionLabel={t.chooseFile}
          description="MP3, WAV, M4A, MP4, MOV, WEBM"
          disabled={disabled}
          eyebrow="Upload"
          icon={<UploadCloud className="h-5 w-5" />}
          kind="file"
          labelEn={t.fileHere}
          labelRu={t.fileHereRu}
          title={t.chooseFile}
          onFileSelect={onFileSelect}
        />
        <InputCard
          actionLabel={t.startUrl}
          description={t.directMediaOnly}
          disabled={disabled}
          eyebrow="URL"
          icon={<Link2 className="h-5 w-5" />}
          kind="url"
          labelEn={t.linkHere}
          labelRu={t.linkHereRu}
          placeholder={t.urlPlaceholder}
          title={t.startUrl}
          value={url}
          onChange={onUrlChange}
          onSubmit={onUrlSubmit}
        />
      </div>
    </motion.div>
  );
};
