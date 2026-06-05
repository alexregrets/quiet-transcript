# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```powershell
pnpm install                                          # install all workspace deps
pnpm dev:desktop                                      # Tauri + React dev (hot reload)
pnpm dev:web                                          # Next.js dev
pnpm dev:bot                                          # Telegraf bot dev
pnpm typecheck                                        # tsc across all workspaces
pnpm test                                             # Vitest (core package only; other workspaces print placeholder)
pnpm --filter @transcriber/core test -- --run <file> # run a single test file
pnpm build                                            # build all workspaces
pnpm --filter @transcriber/desktop tauri:build        # production Tauri installer
```

## Environment

The root `.env` (copied from `.env.example`) is the single source of truth for all env vars:

- `GLADIA_API_KEY` — Rust/Tauri process only. **Never expose as `VITE_GLADIA_API_KEY`.**
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — client-safe, read by Vite.

The Tauri `main.rs` walks up from `CARGO_MANIFEST_DIR` looking for the `.env` nearest the `pnpm-workspace.yaml` root, so the dev key does not need to be copied into `src-tauri/`.

## Architecture

This is a pnpm monorepo with four workspaces:

**`packages/core`** — shared business logic. Owns `TranscriptionProvider` interface, `TranscriptionResult`/`HistoryRecord` types (see `types.ts`), Gladia REST provider, Markdown builder, URL validation, and filename sanitization. `TranscriptionStatus` (`queued → uploading → extracting → sending → transcribing → building_markdown → done | error`) drives the desktop UI state machine. Keep new provider or formatting logic here.

**`apps/desktop`** — Tauri 2 + React + Vite. The Rust backend (`src-tauri/src/main.rs`) handles all Gladia calls via four Tauri commands: `transcribe_file` (browser `File` bytes), `transcribe_file_path` (drag-and-drop native path), `transcribe_url`, and `env_health_check` (returns loaded `.env` path and whether `GLADIA_API_KEY` is present — useful for debugging). The React frontend calls these via `desktopBridge.ts`. The Rust side also manages deep-link auth callbacks (`quiet-transcript://auth`) forwarded to the frontend as `auth-deep-link` events. UI text is localized via `src/lib/i18n.ts` (currently EN/JA); add new strings there rather than hardcoding.

**`apps/web`** — Next.js shell. Phase 2; Gladia calls are not yet implemented server-side.

**`apps/bot`** — Telegraf (Node.js). Can share `packages/core` directly.

**`packages/ui`** — Minimal shared React primitives (Button, Card, cn).

**`supabase/schema.sql`** — Profiles, consent, and transcription history tables with RLS. Run in the Supabase SQL editor; enable email magic links and add `quiet-transcript://auth` to allowed redirect URLs.

## Gladia flow (Rust)

1. `POST /v2/upload` → get `audio_url`
2. `POST /v2/pre-recorded` with `audio_url` → get job `id` + `result_url`
3. Poll `GET result_url` every 2.5 s (max 120 polls) until `status === "done"`

Markdown is built in Rust (`build_markdown`) mirroring `packages/core/src/markdown.ts`. Keep them in sync when changing output format.

## Security invariants

- `GLADIA_API_KEY` stays Rust-side only.
- Tauri commands validate filenames (no path separators) and extensions before reading any bytes.
- URL inputs accept only `http`/`https` schemes.
- Supabase RLS must stay enabled.
- Tauri capabilities (`src-tauri/capabilities/default.json`) should remain minimal.
