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
  keystorePath: string;
}

const DEFAULT_KEYSTORE_FILENAME = ".bot-keys.json";

/**
 * Returns the config, or the variables that still need to be set.
 *
 * Note there is no GLADIA_API_KEY here: every Telegram user supplies their own key
 * through /setkey, so the server never holds a shared transcription key.
 */
export const readConfig = (
  envFile?: string
): { ok: true; config: BotConfig } | { ok: false; missing: string[] } => {
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN?.trim();

  if (!telegramToken) {
    return { ok: false, missing: ["TELEGRAM_BOT_TOKEN"] };
  }

  const configured = process.env.BOT_KEYSTORE_PATH?.trim();
  // Defaults beside the .env, which is already the directory holding this deployment's secrets.
  const keystorePath =
    configured || join(envFile ? dirname(envFile) : process.cwd(), DEFAULT_KEYSTORE_FILENAME);

  return { ok: true, config: { telegramToken, keystorePath } };
};
