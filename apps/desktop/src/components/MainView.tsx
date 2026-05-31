import { Link2, UploadCloud } from "lucide-react";
import { motion } from "framer-motion";
import { InputCard } from "./InputCard";
import { AuthScreen } from "./AuthScreen";
import type { Locale } from "../lib/i18n";
import { copy } from "../lib/i18n";

const greeting = (t: (typeof copy)[Locale]) => {
  const hour = new Date().getHours();
  if (hour < 12) return t.goodMorning;
  if (hour < 17) return t.goodAfternoon;
  return t.goodEvening;
};

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
  onContinueWithoutAccount: () => void;
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
  onAuthSubmit,
  onContinueWithoutAccount
}: MainViewProps) => {
  const t = copy[locale];

  if (showAuth) {
    return (
      <AuthScreen
        consent={consent}
        disabled={authDisabled}
        email={email}
        locale={locale}
        message={authMessage}
        onConsentChange={onConsentChange}
        onEmailChange={onEmailChange}
        onContinueWithoutAccount={onContinueWithoutAccount}
        onSubmit={onAuthSubmit}
      />
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mx-auto w-full max-w-[1040px]">
      <div className="mb-10">
        <h2 className="text-[48px] font-semibold leading-none text-app-text">{greeting(t)}</h2>
        <p className="mt-4 max-w-xl text-base leading-7 text-app-muted">Drop a media file or paste a direct media URL. Quiet Transcript will return clean Markdown.</p>
      </div>

      {demoMode ? <p className="mb-4 rounded-2xl border border-amber-300/60 bg-amber-100/60 px-4 py-3 text-sm text-amber-900">{t.demoMode}</p> : null}
      {error ? <p className="mb-4 rounded-2xl border border-red-300/60 bg-red-100/60 px-4 py-3 text-sm text-red-800">{error}</p> : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <InputCard
          actionLabel={t.chooseFile}
          description="MP3, WAV, M4A, AAC, OGG, OPUS, FLAC, MP4, MOV, WEBM, MKV"
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
