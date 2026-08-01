# AGENTS.md

## Project Overview

Quiet Transcript is a bilingual desktop-first transcription app. The first MVP uses Tauri + React for desktop, Gladia as the primary transcription provider, Supabase Auth/history, and Markdown export.

## Repo Structure

- `apps/desktop` - Tauri + React + Vite desktop MVP.
- `apps/web` - Next.js web shell for phase 2.
- `apps/bot` - Telegraf bot workspace.
- `packages/core` - provider abstraction, Markdown builder, source validation, history types.
- `packages/ui` - shared React UI primitives.
- `supabase` - SQL schema and setup notes.
- `docs` - architecture notes and future extraction work.

## Install Commands

```bash
pnpm install
```

## Run Commands

```bash
pnpm dev:desktop
pnpm dev:web
pnpm dev:bot
```

## Build Commands

```bash
pnpm build
pnpm --filter @transcriber/desktop tauri:build
```

## Lint And Typecheck Commands

```bash
pnpm lint
pnpm typecheck
pnpm test

cd apps/desktop/src-tauri && cargo test
cd apps/desktop/src-tauri && cargo clippy --all-targets -- -D warnings
```

CI (`.github/workflows/ci.yml`) runs all of the above. Both must be green before a task
is done — the Rust backend has its own tests and is not covered by `pnpm test`.

## Coding Conventions

- Use TypeScript for app and shared package code.
- Keep shared business logic in `packages/core`.
- Desktop transcription progress comes from Rust `transcription-progress` events. Never
  reintroduce a timer that guesses at it.
- Rust commands fail with `{ code, detail }`; the UI translates `code` through
  `errorCopy` in `apps/desktop/src/lib/i18n.ts`. A new failure mode needs both.
- Never pass file bytes through `invoke` — hand Rust a path.
- yt-dlp must not use `--extract-audio`/`--audio-format`: that pulls in ffmpeg, which the
  desktop app does not bundle.
- Keep React UI minimal, soft, and precise.
- Avoid large abstractions until a second provider or client actually needs them.
- Prefer focused tests around core formatting, validation, and provider mapping.
- Add comments only for security-sensitive or non-obvious decisions.

## Security Rules

- Never hardcode API keys or secrets.
- Keep Gladia keys out of browser-visible Vite env variables.
- Do not store raw media permanently unless explicitly enabled.
- Sanitize filenames before display or download.
- Validate URLs and only allow `http` or `https`.
- Prevent arbitrary local file access from Tauri commands.
- Keep Tauri capabilities minimal.
- Keep Supabase RLS enabled.

## Definition Of Done

- Desktop app opens and shows the bilingual workspace.
- Email sign-in is configured through Supabase.
- Audio/video file selection starts transcription.
- Direct media URL submission starts transcription.
- Processing dashboard appears during work.
- Transcript returns as Markdown.
- Markdown can be copied and downloaded.
- History appears in the sidebar.
- Supabase schema supports profiles, consent, and transcription records.
- Environment variables are documented.
- README setup is current.
- TypeScript builds without errors, and `cargo test` plus clippy pass.
