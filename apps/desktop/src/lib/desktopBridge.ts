import { invoke } from "@tauri-apps/api/core";
import type { TranscriptionResult } from "@transcriber/core";

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

export const transcribeFileOnDesktop = async (file: File) => {
  if (!isTauri()) {
    throw new Error("Desktop transcription requires Tauri. Use the packaged app or `pnpm dev:desktop`.");
  }

  const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
  return invoke<DesktopTranscriptPayload>("transcribe_file", {
    filename: file.name,
    mimeType: file.type || null,
    bytes
  });
};

export const transcribeFilePathOnDesktop = async (path: string) => {
  if (!isTauri()) {
    throw new Error("Desktop transcription requires Tauri. Use the packaged app or `pnpm dev:desktop`.");
  }

  return invoke<DesktopTranscriptPayload>("transcribe_file_path", { path });
};

export const transcribeUrlOnDesktop = async (url: string) => {
  if (!isTauri()) {
    throw new Error("Desktop transcription requires Tauri. Use the packaged app or `pnpm dev:desktop`.");
  }

  return invoke<DesktopTranscriptPayload>("transcribe_url", { url });
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
