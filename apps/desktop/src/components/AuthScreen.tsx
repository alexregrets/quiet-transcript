import type { FormEvent } from "react";
import { FileText } from "lucide-react";
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
  onContinueWithoutAccount: () => void;
}

export const AuthScreen = ({
  locale,
  email,
  consent,
  disabled,
  message,
  onEmailChange,
  onConsentChange,
  onSubmit,
  onContinueWithoutAccount
}: AuthScreenProps) => {
  const t = copy[locale];

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void onSubmit();
  };

  return (
    <div className="flex min-h-[calc(100vh-124px)] w-full items-center justify-center">
      <form className="w-full max-w-[420px] rounded-[28px] border border-stone-200 bg-[#f8f6f1] p-8 text-stone-950 shadow-lift" onSubmit={handleSubmit}>
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-[#2563eb] text-white shadow-soft">
            <FileText className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-semibold">Transcribe.md</h1>
          <p className="mt-2 text-sm text-stone-500">{t.authTitle}</p>
        </div>

        <label className="mb-2 block text-sm font-medium text-stone-700">Email</label>
        <input
          className="mb-4 h-12 w-full rounded-2xl border border-stone-200 bg-white px-4 text-sm text-stone-950 outline-none transition focus:border-[#2563eb] focus:ring-4 focus:ring-blue-100"
          placeholder={t.emailPlaceholder}
          type="email"
          value={email}
          onChange={(event) => onEmailChange(event.target.value)}
        />

        <label className="mb-2 block text-sm font-medium text-stone-700">Password</label>
        <input
          className="mb-4 h-12 w-full rounded-2xl border border-stone-200 bg-white px-4 text-sm text-stone-950 outline-none transition focus:border-[#2563eb] focus:ring-4 focus:ring-blue-100"
          placeholder="••••••••"
          type="password"
        />

        <label className="mb-5 flex gap-2 text-xs leading-5 text-stone-500">
          <input checked={consent} type="checkbox" onChange={(event) => onConsentChange(event.target.checked)} />
          <span>{t.marketingConsent}</span>
        </label>

        <button
          className="h-12 w-full rounded-2xl bg-[#2563eb] px-4 text-sm font-semibold text-white transition hover:bg-[#1d4ed8] disabled:opacity-50"
          disabled={disabled || !email}
          type="submit"
        >
          {t.sendMagicLink}
        </button>
        <button
          className="mt-3 h-12 w-full rounded-2xl border border-stone-200 bg-white px-4 text-sm font-semibold text-stone-700 transition hover:bg-stone-50"
          type="button"
          onClick={onContinueWithoutAccount}
        >
          {t.continueWithoutAccount}
        </button>
        {message ? <p className="mt-4 text-center text-xs text-stone-500">{message}</p> : null}
      </form>
    </div>
  );
};
