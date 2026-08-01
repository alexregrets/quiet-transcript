# Quiet Transcript

**AI-native desktop transcription app.** Drop audio, video, or a social link → get clean Markdown.

Built with Tauri 2 + React + Rust + Supabase + Gladia + yt-dlp.

---

## What It Does

```
audio/video file, direct media URL, or social link (YouTube/TikTok/VK/Instagram/Rutube)
→ yt-dlp extracts audio (if social link)
→ Gladia transcription API
→ clean Markdown output
→ copy / download .md
→ save to history (local or Supabase)
```

Two window modes: full workspace (sidebar + themes) and a 420×500 mini mode for quick one-off transcriptions.

Target user: knowledge workers, students, researchers who want transcripts in Markdown for Obsidian, Notion, or AI tools.

---

## Current Status (August 2026)

### Working ✅
- Desktop app launches, no console window in release build
- File → Gladia → Markdown transcript. Files are chosen through the native picker and passed to Rust **by path**; nothing goes through the IPC bridge as bytes
- Direct media URL → Gladia → Markdown transcript
- **Social URL extraction** — YouTube, TikTok, VK, Instagram, Rutube via bundled yt-dlp. Downloads an existing audio stream rather than re-encoding, so no ffmpeg is required
- **Real progress** — Rust emits each stage (`uploading → extracting → sending → transcribing → building → done`) and the UI follows it
- **Survives a flaky connection** — HTTP timeouts everywhere, polling retries transient failures for up to an hour instead of losing the job
- Localized failures — Rust returns an error code, the UI renders it in EN/RU with the raw technical detail alongside
- Copy Markdown / Download .md — native clipboard/filesystem calls (browser APIs were unreliable in WebView2)
- History sidebar (local, grouped TODAY/EARLIER), Supabase sync for logged-in users, per-record delete (cloud and local), local history merges with cloud on sign-in instead of being replaced
- 4 themes: Light, Dark, Blue, Sepia
- Bilingual UI: EN/RU
- Demo / accountless mode — visible "Continue without account" button, no env flag needed
- Email magic link auth via Supabase
- Deep link: `quiet-transcript://auth` — single-instance plugin ensures this focuses the existing window instead of opening a second one
- Drag-and-drop via Tauri's native `onDragDropEvent`, accepting all 11 supported formats
- Mini compact mode (420×500) — URL input, compact picker, transcribe button, Copy/Download, Settings
- User-supplied Gladia API key — Settings screen, stored in localStorage, falls back to `.env` `GLADIA_API_KEY` in dev
- Windows installer builds via `tauri:build` (which fetches yt-dlp first)
- Tests: 31 in `packages/core`, 29 in `apps/bot`, 16 Rust unit tests. CI runs all of them plus clippy

### Telegram bot ✅
- **Bring your own key.** Each user connects their own Gladia key with `/setkey`, so the
  server holds no shared transcription key and nobody spends someone else's quota.
  `/deletekey` removes it. Keys live in `.bot-keys.json` (0600, gitignored, never logged).
- Transcribes voice messages, audio, video, video notes, and media documents
- Direct media URLs go straight to Gladia; social links go through yt-dlp first
- Replies with a `.md` file; one status message is edited in place for progress
- EN/RU based on the Telegram client language; one job per chat at a time
- Rejects files over Telegram's 20 MB bot download limit with an explanation
- Deploys via systemd — see `deploy/DEPLOY.md`. Server `.env` needs only `TELEGRAM_BOT_TOKEN`.
- Starts and connects to Telegram; **transcription itself is not yet confirmed end-to-end**

### Not Working / TODO ❌
- `apps/web` — stub only (~23 lines), imports `@transcriber/core` but no server-side Gladia route yet
- `packages/ui` — three primitives, zero consumers. Either wire it up or delete it
- Additional transcription providers beyond Gladia (OpenAI Whisper, AssemblyAI, Deepgram considered, not built)
- AI summary after transcription — deliberately deferred, no API budget for Anthropic calls
- Landing page
- Onboarding flow for first-time users
- No way to cancel a running transcription from the UI
- Telegram Stars monetization — researched, not implemented

---

## Architecture

```
apps/
  desktop/          ← main app (Tauri 2 + React + Vite + TypeScript) — this is the real product
    src/
      components/   ← Sidebar, MainView, MiniView, ProcessingView, ResultView,
                       InputCard, AuthScreen, SettingsView, ThemeToggle, LanguageToggle
      lib/          ← desktopBridge.ts (Tauri command wrappers), supabase.ts, i18n.ts
    src-tauri/
      src/main.rs   ← Gladia calls, yt-dlp invocation, env loading, file-path
                       transcription, progress events, typed error codes, deep link
                       handler, single-instance plugin, unit tests
      tauri.conf.json
      capabilities/default.json

scripts/
  fetch-ytdlp.ps1   ← downloads the bundled yt-dlp (gitignored, required to build)

  web/              ← stub, Phase 2. No Gladia server route yet.
  bot/              ← Telegraf. config/router/extract/pipeline/keystore/messages split
                       so routing, size limits, and key storage are unit-testable
                       without network. keystore.ts holds each user's own Gladia key.

packages/
  core/             ← TranscriptionProvider interface, Gladia REST provider,
                       TranscriptionResult/HistoryRecord types, status state machine
                       (queued → uploading → extracting → sending → transcribing →
                        building_markdown → done | error), Markdown builder,
                       URL validation, filename sanitization, Supabase history helpers.
                       Has Vitest tests for the Markdown builder.
  ui/               ← shared React primitives, used by desktop and (eventually) web

supabase/
  schema.sql        ← profiles, marketing_consent, transcriptions tables, RLS policies

deploy/
  setup-server.sh   ← idempotent Debian/Ubuntu provisioning for the bot
  quiet-transcript-bot.service
  DEPLOY.md

docs/
  source-extraction.md
```

**Key security rule:** `GLADIA_API_KEY` lives only in Rust/Tauri, or is supplied by the user via Settings and stored in localStorage — never as `VITE_GLADIA_API_KEY`. Supabase anon key is safe for frontend.

---

## Stack

| Layer | Tech | Why |
|---|---|---|
| Desktop shell | Tauri 2 | Rust backend, lightweight, API key stays server-side |
| Frontend | React + Vite + TypeScript | Fast dev, good TS support |
| Styling | Tailwind + CSS variables | 4 themes via token swap |
| Transcription | Gladia API | Free tier 10h/month, good accuracy |
| Social extraction | yt-dlp (bundled) | Pulls audio from YouTube/TikTok/VK/Instagram/Rutube before sending to Gladia |
| Auth + History | Supabase | Email magic link, RLS, free tier |
| Monorepo | pnpm workspace | Shared packages across desktop/web/bot |

---

## Windows Setup (new machine)

```powershell
winget install OpenJS.NodeJS.LTS --source winget
winget install Rustlang.Rustup --source winget
winget install Git.Git --source winget
winget install Microsoft.VisualStudio.2022.BuildTools --override "--add Microsoft.VisualStudio.Workload.VCTools --includeRecommended --quiet --wait"
winget install Microsoft.EdgeWebView2Runtime --source winget
```

Restart PowerShell, then:

```powershell
npm install -g pnpm
rustup default stable
```

Verify:
```powershell
node --version
pnpm --version
rustc --version
cargo --version
```

Clone and install:
```powershell
git clone https://github.com/alexregrets/quiet-transcript
cd quiet-transcript
pnpm install
```

---

## Environment Setup

Create `.env` in repo root — **must be UTF-8**. PowerShell's `echo > .env` writes the wrong encoding and Rust/dotenvy will silently fail to read it. Always use `Set-Content -Encoding utf8`:

```powershell
Set-Content -Path .env -Value "GLADIA_API_KEY=your_key" -Encoding utf8
Add-Content -Path .env -Value "VITE_SUPABASE_URL=https://your-project.supabase.co" -Encoding utf8
Add-Content -Path .env -Value "VITE_SUPABASE_ANON_KEY=your_anon_key" -Encoding utf8
```

Expected log on startup:
```
[env] loaded: C:\...\quiet-transcript\.env
[env] GLADIA_API_KEY present after load: true
```

Note: end users don't need this `.env` — they can enter their own Gladia key in the app's Settings screen. The `.env` path is for local dev only.

---

## Supabase Setup

1. Create project at supabase.com (this project uses EU West / Ireland region)
2. Run `supabase/schema.sql` in SQL Editor
3. Authentication → Providers → Email → enable
4. Authentication → URL Configuration:
   - Site URL: `http://127.0.0.1:1420`
   - Redirect URLs: add `quiet-transcript://auth`

---

## Run / Build / Typecheck

```powershell
pnpm dev:desktop                                       # fetches yt-dlp, then runs Tauri
pnpm --filter @transcriber/desktop tauri:build
pnpm typecheck
pnpm test
cd apps/desktop/src-tauri; cargo test
```

Installer output: `apps/desktop/src-tauri/target/release/bundle/` (`.msi` and `.exe`)
Plain exe: `apps/desktop/src-tauri/target/release/quiet_transcript.exe`

If `pnpm typecheck` fails in an agent shell with a generic `fetch failed`, run the desktop check directly as a workaround:
```powershell
node_modules\.bin\tsc.cmd -p apps\desktop\tsconfig.json --noEmit
```

---

## Gladia API Flow

1. `POST /v2/upload` — upload file bytes, get `audio_url`
2. `POST /v2/pre-recorded` — start transcription job with `audio_url`
3. Poll `GET /v2/pre-recorded/:id` until `status === "done"`
4. Parse utterances → Markdown builder → ResultView

For social links: yt-dlp extracts audio to a temp file first, then the same flow runs; temp file is cleaned up after transcription.

---

## Known Issues / Gotchas

- **Drag-and-drop uses Tauri's native `onDragDropEvent`, never HTML5 handlers.** With `dragDropEnabled: true` the WebView suppresses HTML5 drops on purpose, so an HTML5 dropzone shows a "forbidden" cursor. If the cursor is forbidden in dev, check elevation first: Windows blocks drops from a normal Explorer into an elevated process (UIPI), so a dev server started in an admin terminal will refuse every drop.
- **ffmpeg is not bundled.** yt-dlp must stay on `-f bestaudio`; `--extract-audio --audio-format` invokes its FFmpeg post-processor and fails on any machine without ffmpeg installed.
- **`yt-dlp.exe` is gitignored** but declared in `bundle.resources`. `scripts/fetch-ytdlp.ps1` downloads it and both `tauri:dev` and `tauri:build` call it. Re-run with `-Force` when extraction starts failing — social sites change.
- **PowerShell `.env` encoding** — always `Set-Content -Encoding utf8`, never `echo > .env`.
- **Browser clipboard/download APIs were unreliable in WebView2** — the app uses native Tauri calls instead. If touching copy/download logic, keep using the native path, don't revert to `navigator.clipboard` / anchor-download tricks.
- **Never send file bytes through `invoke`** — they serialize as a JSON array of numbers. Pass a path and let Rust read the file.
- **Magic link previously opened a second window** — fixed via `tauri-plugin-single-instance`; the deep link handler forwards the URL to the first window and calls `set_focus()`. Don't remove this plugin.

---

## Roadmap / Priority Order

1. Confirm the `.msi` installer runs cleanly on a fresh Windows machine
2. Cancel button for a running transcription
3. Simple onboarding for first-time users
4. Landing page
5. `apps/web` — add server-side Gladia route, connect to `packages/core`
6. Telegram Stars monetization (researched: works via Telegram Mini App inside the bot)
7. Additional transcription providers (user choice of Gladia / Whisper / AssemblyAI / Deepgram) — deferred, no immediate need

---

## Agent Handoff Notes

If you are an AI agent (Claude Code, Codex, Cursor) working on this project:

- Read `AGENTS.md` for task rules and Definition of Done
- `GLADIA_API_KEY` must stay Rust-side or user-supplied via Settings — never `VITE_GLADIA_API_KEY`
- Run typecheck (`pnpm typecheck` or the direct `tsc` workaround above) before marking any task done
- Commit after each working feature — the project owner tests manually between commits, so keep commits scoped to one fix/feature at a time
- Do not "fix" drag-and-drop in dev mode — it's expected behavior, only production build matters
- Do not revert native clipboard/download calls back to browser APIs
- Do not remove `tauri-plugin-single-instance` or the deep link focus handler
- This is currently a **solo project moving toward a small team** (one collaborator, "Vanity", added on GitHub) — keep code readable for a second contributor, not just optimized for one person's mental model
