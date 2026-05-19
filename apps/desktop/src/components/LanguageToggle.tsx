import { Languages } from "lucide-react";
import type { Locale } from "../lib/i18n";

interface LanguageToggleProps {
  locale: Locale;
  onToggle: () => void;
}

export const LanguageToggle = ({ locale, onToggle }: LanguageToggleProps) => (
  <button
    className="inline-flex h-9 items-center gap-2 rounded-full border border-app-border/80 bg-app-panel/70 px-3 text-sm font-medium text-app-text transition hover:bg-app-panel-strong"
    type="button"
    onClick={onToggle}
  >
    <Languages className="h-4 w-4" />
    {locale === "ru" ? "EN" : "RU"}
  </button>
);
