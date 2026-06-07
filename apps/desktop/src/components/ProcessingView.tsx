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
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto flex w-full max-w-[600px] flex-col items-center gap-6"
    >
      <div className="text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-app-muted">Processing</p>
        <h2 className="mt-2 text-3xl font-semibold text-app-text">{t.transcribing}</h2>
      </div>

      <div className="flex h-16 w-full items-end justify-center gap-1">
        {Array.from({ length: 32 }, (_, index) => (
          <span
            key={index}
            className="wave-bar block w-1.5 rounded-full bg-app-text/80"
            style={{
              height: `${16 + ((index * 9) % 38)}px`,
              animationDelay: `${index * 0.035}s`,
            }}
          />
        ))}
      </div>

      <p className="text-5xl font-semibold tabular-nums text-app-text">{progress}%</p>

      <ol className="w-full space-y-2">
        {stepKeys.map((key, index) => {
          const isActive = index === activeStep;
          const isDone = index < activeStep;
          return (
            <motion.li
              key={key}
              animate={{ opacity: isActive ? 1 : isDone ? 0.72 : 0.36 }}
              className="flex items-center gap-3 px-2"
            >
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  isActive ? "bg-app-text" : isDone ? "bg-app-accent" : "bg-app-border"
                }`}
              />
              <span
                className={`text-sm font-medium ${
                  isActive ? "text-app-text" : isDone ? "text-app-muted" : "text-app-muted/50"
                }`}
              >
                {t[key]}
              </span>
            </motion.li>
          );
        })}
      </ol>

      {log.length > 0 && (
        <div className="w-full overflow-y-auto rounded-card border border-app-border/60 px-3 py-2" style={{ maxHeight: "4.5rem" }}>
          {log.map((item) => (
            <p key={item} className="py-0.5 text-xs text-app-muted">
              {item}
            </p>
          ))}
        </div>
      )}
    </motion.section>
  );
};
