# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```powershell
pnpm install                                          # install all workspace deps
pnpm dev:desktop                                      # Tauri + React dev (hot reload)
pnpm dev:web                                          # Next.js dev
pnpm dev:bot                                          # Telegraf bot dev
pnpm typecheck                                        # tsc across all workspaces
pnpm test                                             # Vitest (core and bot; ui/web print a placeholder)
pnpm --filter @transcriber/core test -- --run <file>  # run a single test file
pnpm build                                            # build all workspaces
pnpm --filter @transcriber/desktop tauri:build        # production Tauri installer
pnpm --filter @transcriber/desktop fetch:ytdlp        # download the bundled yt-dlp (-Force to refresh)
cd apps/desktop/src-tauri; cargo test                 # Rust unit tests
cd apps/desktop/src-tauri; cargo clippy --all-targets -- -D warnings
```

CI (`.github/workflows/ci.yml`) runs typecheck + Vitest on Linux and `cargo test` + clippy on Windows.

## Environment

The root `.env` (copied from `.env.example`) is the single source of truth for all env vars:

- `GLADIA_API_KEY` — Rust/Tauri process only. **Never expose as `VITE_GLADIA_API_KEY`.**
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — client-safe, read by Vite.
- `TELEGRAM_BOT_TOKEN` / `BOT_KEYSTORE_PATH` — bot only.

The Tauri `main.rs` walks up from `CARGO_MANIFEST_DIR` looking for the `.env` nearest the `pnpm-workspace.yaml` root, so the dev key does not need to be copied into `src-tauri/`. Installed builds ship no `.env` — end users supply their own key in Settings, stored in `localStorage`.

## Architecture

This is a pnpm monorepo with four workspaces:

**`packages/core`** — shared business logic. Owns the `TranscriptionProvider` interface, `TranscriptionResult`/`HistoryRecord` types (`types.ts`), the Gladia REST provider (used by the bot; the desktop app has its own Rust implementation), the Markdown builder, URL validation, and filename sanitization. `SUPPORTED_MEDIA_EXTENSIONS` here is the single source of truth for accepted formats — mirrored in `main.rs`, so change both together.

**`apps/desktop`** — Tauri 2 + React + Vite. The Rust backend (`src-tauri/src/main.rs`) handles all Gladia calls via five Tauri commands: `transcribe_file_path` (native picker or drag-and-drop path), `transcribe_url`, `verify_gladia_key`, `env_health_check`, and `pending_auth_deep_links`. The React frontend calls these via `desktopBridge.ts`.

Two things the frontend depends on:

- **Progress events.** Rust emits `transcription-progress` with a `stage` (`uploading | extracting | sending | transcribing | building | done`) at each step. Never reintroduce a timer that guesses progress.
- **Error codes.** Commands reject with `{ code, detail }` (`AppError`). `code` maps to a translated sentence in `errorCopy` (`lib/i18n.ts`); `detail` is raw technical text and stays untranslated. New failure modes need both a code in `main.rs` and an entry in both locales.

The Rust side also manages deep-link auth callbacks (`quiet-transcript://auth`) forwarded to the frontend as `auth-deep-link` events. UI text is localized via `src/lib/i18n.ts` (EN/RU); add new strings there rather than hardcoding.

**`apps/web`** — Next.js shell. Phase 2; Gladia calls are not yet implemented server-side.

**`apps/bot`** — Telegraf (Node.js). Uses `packages/core` directly. Each Telegram user supplies their own Gladia key via `/setkey`; keys live in a `0600` JSON file, never a database.

**`packages/ui`** — Minimal shared React primitives (Button, Card, cn). Currently unused by every app.

**`supabase/schema.sql`** — Profiles, consent, and transcription history tables with RLS. Run in the Supabase SQL editor; enable email magic links and add `quiet-transcript://auth` to allowed redirect URLs.

## Gladia flow (Rust)

1. `POST /v2/upload` → get `audio_url`
2. `POST /v2/pre-recorded` with `audio_url` → get job `id` + `result_url`
3. Poll `GET result_url` every 2.5 s until `status === "done"`, for up to an hour of wall clock. A run of transient failures (network, 5xx, 429) is retried rather than failing the job — the transcription keeps running on Gladia's side regardless of our polling.

For links that are not direct media, yt-dlp downloads an existing audio stream first (`-f bestaudio`). It deliberately does **not** use `--extract-audio --audio-format`, which would invoke yt-dlp's FFmpeg post-processor — ffmpeg is not bundled, so that path fails on any clean machine.

Markdown is built in Rust (`build_markdown`) mirroring `packages/core/src/markdown.ts`. Keep them in sync when changing output format; both sides have tests asserting the shape.

## Security invariants

- `GLADIA_API_KEY` stays Rust-side or user-supplied; never a `VITE_*` variable.
- Tauri commands validate filenames (no path separators) and extensions before reading any bytes, and check size from metadata before loading a file into memory.
- URL inputs accept only `http`/`https` schemes.
- yt-dlp receives the URL as an argv entry, never through a shell.
- Supabase RLS must stay enabled.
- Tauri capabilities (`src-tauri/capabilities/default.json`) should remain minimal.
