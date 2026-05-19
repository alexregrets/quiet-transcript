import { motion } from "framer-motion";
import type { Locale } from "../lib/i18n";
import { copy, stepKeys } from "../lib/i18n";

interface ProcessingViewProps {
  locale: Locale;
  activeStep: number;
  log: string[];
}

export const ProcessingView = ({ locale, activeStep, log }: ProcessingViewProps) => {
  const t = copy[locale];
  const progress = Math.round(((activeStep + 1) / stepKeys.length) * 100);

  return (
    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mx-auto w-full max-w-4xl">
      <div className="glass-panel rounded-app p-8">
        <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
          <div className="flex flex-col items-center justify-center">
            <div
              className="grid h-48 w-48 place-items-center rounded-full border border-app-border bg-app-panel-strong/72"
              style={{
                background: `conic-gradient(rgb(var(--app-text)) ${progress * 3.6}deg, rgba(var(--app-border), 0.62) 0deg)`
              }}
            >
              <div className="grid h-36 w-36 place-items-center rounded-full bg-app-panel text-3xl font-semibold text-app-text">
                {progress}%
              </div>
            </div>
            <div className="mt-8 flex h-16 items-end gap-1.5">
              {Array.from({ length: 28 }, (_, index) => (
                <span
                  key={index}
                  className="wave-bar block w-1.5 rounded-full bg-app-text/80"
                  style={{
                    height: `${16 + ((index * 9) % 38)}px`,
                    animationDelay: `${index * 0.035}s`
                  }}
                />
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-app-muted">Processing</p>
            <h2 className="mt-2 text-3xl font-semibold text-app-text">{t.transcribing}</h2>
            <ol className="mt-6 space-y-3">
              {stepKeys.map((key, index) => {
                const isActive = index === activeStep;
                const isDone = index < activeStep;
                return (
                  <motion.li
                    key={key}
                    animate={{ opacity: isActive || isDone ? 1 : 0.52, x: isActive ? 4 : 0 }}
                    className="flex items-center gap-3 rounded-card border border-app-border/70 bg-app-panel-strong/48 px-4 py-3"
                  >
                    <span className={`h-2.5 w-2.5 rounded-full ${isDone || isActive ? "bg-app-text" : "bg-app-border"}`} />
                    <span className="text-sm font-medium text-app-text">{t[key]}</span>
                  </motion.li>
                );
              })}
            </ol>
            <div className="mt-6 rounded-card border border-app-border/80 bg-app-text p-4 text-xs text-app-bg">
              {log.map((item) => (
                <p key={item} className="py-1 opacity-90">
                  {item}
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </motion.section>
  );
};
