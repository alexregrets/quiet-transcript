import { invoke } from "@tauri-apps/api/core";
import type { TranscriptionResult } from "@transcriber/core";
import { loadGladiaKey } from "./apiKey";

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

/**
 * Read at call time rather than passed in by callers, so every entry point
 * (main view, mini view, drag-and-drop) picks up the saved key automatically.
 * `null` lets the Rust side fall back to GLADIA_API_KEY from .env.
 */
const currentApiKey = () => loadGladiaKey() || null;

export const transcribeFileOnDesktop = async (file: File) => {
  if (!isTauri()) {
    throw new Error("Desktop transcription requires Tauri. Use the packaged app or `pnpm dev:desktop`.");
  }

  const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
  return invoke<DesktopTranscriptPayload>("transcribe_file", {
    filename: file.name,
    mimeType: file.type || null,
    bytes,
    apiKey: currentApiKey()
  });
};

export const transcribeFilePathOnDesktop = async (path: string) => {
  if (!isTauri()) {
    throw new Error("Desktop transcription requires Tauri. Use the packaged app or `pnpm dev:desktop`.");
  }

  return invoke<DesktopTranscriptPayload>("transcribe_file_path", { path, apiKey: currentApiKey() });
};

export const transcribeUrlOnDesktop = async (url: string) => {
  if (!isTauri()) {
    throw new Error("Desktop transcription requires Tauri. Use the packaged app or `pnpm dev:desktop`.");
  }

  return invoke<DesktopTranscriptPayload>("transcribe_url", { url, apiKey: currentApiKey() });
};

export type KeyVerdict = "valid" | "unverified";

/** Resolves to a verdict, or rejects with a message when Gladia refuses the key. */
export const verifyGladiaKeyOnDesktop = async (apiKey: string) => {
  if (!isTauri()) {
    throw new Error("Key verification requires the desktop app.");
  }

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
