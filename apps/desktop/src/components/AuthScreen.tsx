import type { FormEvent } from "react";
import { Mail } from "lucide-react";
import type { Locale } from "../lib/i18n";
import { copy } from "../lib/i18n";

interface AuthScreenProps {
  locale: Locale;
  email: string;
  consent: boolean;
  disabled: boolean;
  message?: string | undefined;
  onEmailChange: (value: string) => void;
  onConsentChange: (value: boolean) => void;
  onSubmit: () => Promise<void>;
}

export const AuthScreen = ({
  locale,
  email,
  consent,
  disabled,
  message,
  onEmailChange,
  onConsentChange,
  onSubmit
}: AuthScreenProps) => {
  const t = copy[locale];

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void onSubmit();
  };

  return (
    <form className="glass-panel rounded-app p-4" onSubmit={handleSubmit}>
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-app-text">
        <Mail className="h-4 w-4" />
        {t.authTitle}
      </div>
      <input
        className="quiet-input h-10 w-full rounded-full px-4 text-sm"
        placeholder={t.emailPlaceholder}
        type="email"
        value={email}
        onChange={(event) => onEmailChange(event.target.value)}
      />
      <label className="mt-3 flex gap-2 text-xs leading-5 text-app-muted">
        <input checked={consent} type="checkbox" onChange={(event) => onConsentChange(event.target.checked)} />
        <span>{t.marketingConsent}</span>
      </label>
      <button
        className="mt-3 h-10 w-full rounded-full bg-app-text px-4 text-sm font-semibold text-app-bg transition hover:opacity-90 disabled:opacity-50"
        disabled={disabled || !email}
        type="submit"
      >
        {t.sendMagicLink}
      </button>
      {message ? <p className="mt-3 text-xs text-app-muted">{message}</p> : null}
    </form>
  );
};
