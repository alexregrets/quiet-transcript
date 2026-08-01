import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { SUPPORTED_MEDIA_EXTENSIONS, type TranscriptionResult } from "@transcriber/core";
import { loadGladiaKey } from "./apiKey";
import type { StepKey } from "./i18n";

export interface DesktopTranscriptPayload {
  result: TranscriptionResult;
  markdown: string;
}

export interface EnvHealthCheck {
  current_dir?: string;
  cargo_manifest_dir: string;
  loaded_env_path?: string;
  gladia_key_present: boolean;
  checked_paths: string[];
}

const isTauri = () => "__TAURI_INTERNALS__" in window;

const requireTauri = () => {
  if (!isTauri()) {
    throw new Error("This action requires the desktop app. Use the packaged build or `pnpm dev:desktop`.");
  }
};

/**
 * Read at call time rather than passed in by callers, so every entry point
 * (main view, mini view, drag-and-drop) picks up the saved key automatically.
 * `null` lets the Rust side fall back to GLADIA_API_KEY from .env.
 */
const currentApiKey = () => loadGladiaKey() || null;

/**
 * Opens the native picker and returns a path.
 *
 * Deliberately a path and not a `File`: bytes handed to `invoke` are serialized as a JSON
 * array of numbers, which multiplies a 100 MB recording several times over in memory
 * before Rust ever sees it. The path goes straight to `transcribe_file_path`, which
 * streams the file from disk.
 */
export const pickMediaFile = async () => {
  requireTauri();

  const selection = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "Audio & video", extensions: [...SUPPORTED_MEDIA_EXTENSIONS] }]
  });

  return typeof selection === "string" ? selection : null;
};

export const transcribeFilePathOnDesktop = async (path: string) => {
  requireTauri();

  return invoke<DesktopTranscriptPayload>("transcribe_file_path", { path, apiKey: currentApiKey() });
};

export const transcribeUrlOnDesktop = async (url: string) => {
  requireTauri();

  return invoke<DesktopTranscriptPayload>("transcribe_url", { url, apiKey: currentApiKey() });
};

export interface TranscriptionProgress {
  stage: StepKey;
}

/** Real stage updates from Rust, so the UI no longer guesses progress on a timer. */
export const listenToTranscriptionProgress = async (handler: (stage: StepKey) => void) => {
  if (!isTauri()) {
    return () => undefined;
  }

  return listen<TranscriptionProgress>("transcription-progress", (event) => handler(event.payload.stage));
};

export type KeyVerdict = "valid" | "unverified";

/** Resolves to a verdict, or rejects with a message when Gladia refuses the key. */
export const verifyGladiaKeyOnDesktop = async (apiKey: string) => {
  requireTauri();

  return invoke<KeyVerdict>("verify_gladia_key", { apiKey });
};

export const getEnvHealthCheck = async () => {
  if (!isTauri()) {
    return null;
  }

  return invoke<EnvHealthCheck>("env_health_check");
};

export const getPendingAuthDeepLinks = async () => {
  if (!isTauri()) {
    return [];
  }

  return invoke<string[]>("pending_auth_deep_links");
};
