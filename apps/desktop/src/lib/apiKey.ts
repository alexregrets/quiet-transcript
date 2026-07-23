const API_KEY_STORAGE_KEY = "quiet-transcript-gladia-key";

/**
 * The user's Gladia key, or an empty string when none is saved.
 * An empty value makes the Rust side fall back to GLADIA_API_KEY from .env (dev only).
 */
export const loadGladiaKey = (): string => {
  try {
    return localStorage.getItem(API_KEY_STORAGE_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
};

export const saveGladiaKey = (key: string) => {
  const trimmed = key.trim();

  if (trimmed) {
    localStorage.setItem(API_KEY_STORAGE_KEY, trimmed);
  } else {
    localStorage.removeItem(API_KEY_STORAGE_KEY);
  }
};

/** Shows only the tail of a key so the UI can confirm which one is saved without exposing it. */
export const maskGladiaKey = (key: string) => {
  const trimmed = key.trim();
  return trimmed.length <= 4 ? "••••" : `••••${trimmed.slice(-4)}`;
};
