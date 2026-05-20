export type AppTheme = "light" | "dark" | "blue" | "sepia";

interface ThemeToggleProps {
  theme: AppTheme;
  onChange: (theme: AppTheme) => void;
}

const themes: Array<{ value: AppTheme; label: string }> = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "blue", label: "Blue" },
  { value: "sepia", label: "Sepia" }
];

export const ThemeToggle = ({ theme, onChange }: ThemeToggleProps) => (
  <div className="inline-flex rounded-full border border-app-border/80 bg-app-panel/80 p-1 text-xs font-semibold text-app-muted">
    {themes.map((item) => (
      <button
        key={item.value}
        className={`h-8 rounded-full px-3 transition ${
          theme === item.value ? "bg-app-panel-strong text-app-text shadow-soft" : "hover:text-app-text"
        }`}
        type="button"
        onClick={() => onChange(item.value)}
      >
        {item.label}
      </button>
    ))}
  </div>
);
