import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Walks up looking for a `.env`, preferring the one beside `pnpm-workspace.yaml`.
 * Mirrors how the Tauri backend locates the repo-root `.env` so both surfaces read
 * the same file in development.
 */
const findEnvFile = () => {
  const candidates: string[] = [];
  let current = dirname(fileURLToPath(import.meta.url));

  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = join(current, ".env");

    if (existsSync(candidate)) {
      if (existsSync(join(current, "pnpm-workspace.yaml"))) {
        return candidate;
      }

      candidates.push(candidate);
    }

    const parent = dirname(current);
    if (parent === current) {
      break;
    }

    current = parent;
  }

  return candidates.at(-1);
};

/** Loads the repo `.env` when present. Real environment variables (e.g. systemd) still apply. */
export const loadEnvironment = () => {
  const envFile = findEnvFile();
  if (!envFile) {
    return undefined;
  }

  // Feature-detected because the typings for loadEnvFile lag behind the runtime.
  const loadEnvFile = (process as NodeJS.Process & { loadEnvFile?: (path: string) => void }).loadEnvFile;

  if (typeof loadEnvFile === "function") {
    try {
      loadEnvFile.call(process, envFile);
    } catch {
      return undefined;
    }

    return envFile;
  }

  return undefined;
};

export interface BotConfig {
  telegramToken: string;
  gladiaApiKey: string;
}

/** Returns the config, or the list of variables that still need to be set. */
export const readConfig = (): { ok: true; config: BotConfig } | { ok: false; missing: string[] } => {
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const gladiaApiKey = process.env.GLADIA_API_KEY?.trim();
  const missing: string[] = [];

  if (!telegramToken) {
    missing.push("TELEGRAM_BOT_TOKEN");
  }

  if (!gladiaApiKey) {
    missing.push("GLADIA_API_KEY");
  }

  if (!telegramToken || !gladiaApiKey) {
    return { ok: false, missing };
  }

  return { ok: true, config: { telegramToken, gladiaApiKey } };
};
