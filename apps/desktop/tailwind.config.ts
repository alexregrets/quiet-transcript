import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        app: {
          bg: "rgb(var(--app-bg) / <alpha-value>)",
          panel: "rgb(var(--app-panel) / <alpha-value>)",
          "panel-strong": "rgb(var(--app-panel-strong) / <alpha-value>)",
          text: "rgb(var(--app-text) / <alpha-value>)",
          muted: "rgb(var(--app-muted) / <alpha-value>)",
          border: "rgb(var(--app-border) / <alpha-value>)",
          accent: "rgb(var(--app-accent) / <alpha-value>)"
        }
      },
      borderRadius: {
        app: "var(--radius-panel)",
        card: "var(--radius-card)"
      },
      boxShadow: {
        soft: "var(--shadow-soft)",
        lift: "var(--shadow-lift)"
      },
      fontFamily: {
        sans: ["DM Sans", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        marker: ["Caveat", "Segoe Print", "cursive"]
      }
    }
  },
  plugins: []
};

export default config;
