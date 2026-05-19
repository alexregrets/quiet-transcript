# Quiet Transcript

Quiet Transcript is a bilingual desktop-first transcription MVP. Users can sign in with email, choose an audio/video file or paste a direct media URL, transcribe through Gladia, preview the result, copy/download Markdown, and save history through Supabase.

## Architecture

- `apps/desktop` - Tauri 2 + React + Vite MVP. The Rust side owns Gladia calls so `GLADIA_API_KEY` is never exposed to client code.
- `apps/web` - Next.js shell for the web version. Phase 2 should add server routes for Gladia upload/transcription.
- `apps/bot` - Telegraf workspace. Node.js was chosen over Python because the rest of the monorepo is TypeScript and can share `packages/core` directly.
- `packages/core` - provider abstraction, Gladia REST provider, URL validation, filename sanitization, Markdown builder, history types.
- `packages/ui` - small shared React primitives.
- `supabase/schema.sql` - Auth profile and transcription history schema with RLS.

## Windows Setup

Install prerequisites in PowerShell:

```powershell
winget install OpenJS.NodeJS.LTS
winget install Rustlang.Rustup
winget install Microsoft.VisualStudio.2022.BuildTools --override "--add Microsoft.VisualStudio.Workload.VCTools --includeRecommended --quiet --wait"
winget install Microsoft.EdgeWebView2Runtime
corepack enable
corepack prepare pnpm@9.15.4 --activate
```

Restart PowerShell, then verify:

```powershell
node --version
pnpm --version
rustc --version
cargo --version
```

Install dependencies and create the root env file:

```powershell
pnpm install
Copy-Item .env.example .env
```

Required environment variables:

```bash
GLADIA_API_KEY=your_gladia_key
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

The desktop Vite app reads `VITE_*` values from the repo-root `.env`. The Tauri Rust process also reads the repo-root `.env` for `GLADIA_API_KEY`, so do not create a browser-exposed `VITE_GLADIA_API_KEY`.

Run `supabase/schema.sql` in the Supabase SQL editor. Enable Supabase email magic links and add the desktop dev URL, usually `http://127.0.0.1:1420`, to allowed redirect URLs.

## Toolchain And Env Notes

- Node and `pnpm` install and run the frontend/workspace TypeScript packages.
- Rust and Cargo are required by Tauri for the desktop shell; `pnpm dev:desktop` cannot launch without `cargo`.
- Vite exposes only variables with a `VITE_` prefix to browser code.
- `GLADIA_API_KEY` must stay Rust/Tauri-side only. Do not add `VITE_GLADIA_API_KEY`.

## Verify Locally

```powershell
pnpm install
pnpm typecheck
pnpm test
pnpm dev:desktop
```

`pnpm test` runs the core Vitest suite and prints intentional placeholder messages for the desktop, web, and bot workspaces while those surfaces have no separate tests.

## Run

```bash
pnpm dev:desktop
pnpm dev:web
pnpm dev:bot
```

## Build And Verify

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @transcriber/desktop tauri:build
```

## MVP Behavior

- File flow uploads the selected browser `File` bytes to the Tauri backend, then Tauri uploads to Gladia.
- URL flow accepts direct media URLs first.
- YouTube/page extraction is intentionally isolated behind `packages/core/src/source/url.ts` for the next source extractor.
- History is stored locally immediately for responsiveness and can be saved to Supabase after login.
- Raw media is not written to disk by the app.

## Gladia API Shape

The implementation follows Gladia's current prerecorded flow:

1. `POST /v2/upload` for files.
2. `POST /v2/pre-recorded` with `audio_url`.
3. Poll `GET /v2/pre-recorded/:id` until `status === "done"`.

## Security Notes

- Keep `GLADIA_API_KEY` server-side or in the Tauri process only.
- Supabase anon keys are client-safe, but RLS must stay enabled.
- The Tauri command validates filenames, supported extensions, and URL schemes.
- No arbitrary local path is accepted from the UI.
- Raw media bytes are streamed to Gladia and not stored permanently by this app.
