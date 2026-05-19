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
```

## Coding Conventions

- Use TypeScript for app and shared package code.
- Keep shared business logic in `packages/core`.
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
- TypeScript builds without errors.
