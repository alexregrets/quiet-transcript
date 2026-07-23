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

## Current Status (June 2026)

### Working ✅
- Desktop app launches, no console window in release build
- File upload → Gladia → Markdown transcript
- Direct media URL → Gladia → Markdown transcript
- **Social URL extraction** — YouTube, TikTok, VK, Instagram, Rutube via bundled yt-dlp, audio extracted then sent to Gladia
- Copy Markdown / Download .md — native clipboard/filesystem calls (browser APIs were unreliable in WebView2)
- History sidebar (local, grouped TODAY/EARLIER), Supabase sync for logged-in users
- 4 themes: Light, Dark, Blue, Sepia
- Bilingual UI: EN/RU (README/AGENTS mention EN/JA from an earlier pass — RU is what's actually shipped and used)
- Demo / accountless mode — visible "Continue without account" button, no env flag needed
- Email magic link auth via Supabase
- Deep link: `quiet-transcript://auth` — single-instance plugin ensures this focuses the existing window instead of opening a second one
- ProcessingView redesigned — single centered column, animated waveform, step list with active/done/pending states, capped scrollable log
- Drag-and-drop — works in production build (Tauri/WebView2 blocks it in dev mode, this is expected and not worth fixing)
- Mini compact mode (420×500) — URL input, compact drop zone, transcribe button, Copy/Download actions, no sidebar
- User-supplied Gladia API key — Settings screen, stored in localStorage, falls back to `.env` `GLADIA_API_KEY` in dev
- Windows installer builds via `tauri:build`

### Telegram bot ✅
- Transcribes voice messages, audio, video, video notes, and media documents
- Direct media URLs go straight to Gladia; social links go through yt-dlp first
- Replies with a `.md` file; one status message is edited in place for progress
- EN/RU based on the Telegram client language; one job per chat at a time
- Rejects files over Telegram's 20 MB bot download limit with an explanation
- Deploys via systemd — see `deploy/DEPLOY.md`
- **Not yet run against a live bot token** — needs a token from @BotFather

### Not Working / TODO ❌
- `apps/web` — stub only (~23 lines), imports `@transcriber/core` but no server-side Gladia route yet
- Additional transcription providers beyond Gladia (OpenAI Whisper, AssemblyAI, Deepgram considered, not built)
- AI summary after transcription — deliberately deferred, no API budget for Anthropic calls
- Landing page
- Onboarding flow for first-time users
- Broader error handling UX (oversized files, network loss mid-transcription)
- Telegram Stars monetization — researched, not implemented; needs the bot to actually transcribe first
- Mini mode and social URL extraction implemented but **not yet tested end-to-end** — verify before shipping

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
      src/main.rs   ← ~870 lines. Gladia calls, yt-dlp invocation, env loading,
                       file-path transcription, deep link handler, single-instance plugin
      tauri.conf.json
      capabilities/default.json

  web/              ← stub, Phase 2. No Gladia server route yet.
  bot/              ← Telegraf. config/router/extract/pipeline/messages split so the
                       routing and size-limit logic is unit-testable without network.

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
pnpm dev:desktop
pnpm --filter @transcriber/desktop tauri:build
pnpm typecheck
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

- **Drag-and-drop shows a forbidden cursor in `pnpm dev:desktop`** — this is a Tauri/WebView2 dev-mode limitation on Windows, not a real bug. It works correctly in the production build. Don't waste time "fixing" dev mode.
- **PowerShell `.env` encoding** — always `Set-Content -Encoding utf8`, never `echo > .env`.
- **Browser clipboard/download APIs were unreliable in WebView2** — the app uses native Tauri calls instead. If touching copy/download logic, keep using the native path, don't revert to `navigator.clipboard` / anchor-download tricks.
- **Magic link previously opened a second window** — fixed via `tauri-plugin-single-instance`; the deep link handler forwards the URL to the first window and calls `set_focus()`. Don't remove this plugin.
- **README/AGENTS.md may still say EN/JA localization** — that's stale. The shipped languages are EN/RU.

---

## Roadmap / Priority Order

1. **Verify** — test mini mode, the Settings key flow, and social URL extraction
   (YouTube/TikTok/VK/Instagram/Rutube) end-to-end; implemented but not confirmed in practice
2. **Deploy the bot** — needs a token from @BotFather, then `deploy/DEPLOY.md`
3. Confirm `.msi` installer runs cleanly on a fresh Windows machine
4. Remaining error-handling UX — network loss mid-transcription (oversized and empty
   files are now rejected with a clear message)
5. Simple onboarding for first-time users
6. Landing page
7. `apps/web` — add server-side Gladia route, connect to `packages/core`
8. Telegram Stars monetization (researched: works via Telegram Mini App inside the bot)
9. Additional transcription providers (user choice of Gladia / Whisper / AssemblyAI / Deepgram) — deferred, no immediate need

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
