import { errorCopy, type Locale } from "./i18n";

/** The shape Rust commands reject with (`AppError` in `src-tauri/src/main.rs`). */
export interface DesktopError {
  code: string;
  detail?: string;
}

const isDesktopError = (value: unknown): value is DesktopError =>
  typeof value === "object" && value !== null && typeof (value as DesktopError).code === "string";

/**
 * Turns whatever a failed command threw into one sentence in the user's language.
 *
 * Errors are kept as raw values in state rather than pre-rendered strings, so switching
 * the language also re-renders the message that is already on screen.
 */
export const describeError = (cause: unknown, locale: Locale): string => {
  const messages = errorCopy[locale];

  if (isDesktopError(cause)) {
    const known = messages[cause.code as keyof typeof messages];
    const message = known ?? messages.unknown;

    // The detail is raw technical text (Gladia body, yt-dlp stderr) and stays untranslated.
    return cause.detail ? `${message} (${cause.detail})` : message;
  }

  if (cause instanceof Error) {
    return cause.message;
  }

  return String(cause);
};
