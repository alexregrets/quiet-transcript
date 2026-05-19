import { Moon, Sun } from "lucide-react";

interface ThemeToggleProps {
  theme: "light" | "dark";
  onToggle: () => void;
}

export const ThemeToggle = ({ theme, onToggle }: ThemeToggleProps) => (
  <button
    aria-label="Toggle theme"
    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-app-border/80 bg-app-panel/70 text-app-text transition hover:bg-app-panel-strong"
    type="button"
    onClick={onToggle}
  >
    {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
  </button>
);
