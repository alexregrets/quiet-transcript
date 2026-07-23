# Deploying the Telegram bot

The bot is the only workspace that needs a server: it must stay online to poll Telegram.
The desktop app is a Windows binary and the web app is still a stub.

## Who pays for transcription

Every Telegram user connects **their own** Gladia key with `/setkey`. The server holds
no shared transcription key, so running the bot costs you nothing in Gladia quota and
one user cannot exhaust another's.

The trade-off is that the bot stores other people's API keys. They live in
`.bot-keys.json` next to `.env`, written with `0600` permissions, never logged, and
removable by the user at any time with `/deletekey`. Treat that file as a secret: it is
gitignored, and it should not end up in backups that others can read.

## Prerequisites

1. **A Telegram bot token.** Message [@BotFather](https://t.me/BotFather), send `/newbot`,
   follow the prompts, and copy the token it gives you.
2. **A Debian or Ubuntu server** with root access.

You do **not** need a Gladia key on the server.

## One-time server setup

Run everything below on the server as root.

```bash
apt-get update && apt-get install -y curl
curl -fsSL https://raw.githubusercontent.com/alexregrets/quiet-transcript/main/deploy/setup-server.sh -o setup-server.sh
bash setup-server.sh
```

To deploy a branch other than `main`:

```bash
BRANCH=your-branch bash setup-server.sh
```

The script installs Node 22, pnpm, ffmpeg, and yt-dlp; creates a `quiet` service user;
clones the repo to `/opt/quiet-transcript`; installs dependencies; and registers a
systemd unit. It is idempotent — re-run it to deploy new commits.

## Secrets

The script writes an empty `/opt/quiet-transcript/.env`. It needs one value:

```bash
cat > /opt/quiet-transcript/.env <<'EOF'
TELEGRAM_BOT_TOKEN=123456:your-token-here
EOF
chmod 600 /opt/quiet-transcript/.env
chown quiet:quiet /opt/quiet-transcript/.env
```

Optional: set `BOT_KEYSTORE_PATH` to move the user key file somewhere other than
`/opt/quiet-transcript/.bot-keys.json`.

## Start and verify

```bash
systemctl restart quiet-transcript-bot
systemctl status quiet-transcript-bot
journalctl -u quiet-transcript-bot -f
```

A healthy start logs `Bot started`. If the token or key is missing, the bot logs which
variable is unset and exits cleanly rather than crash-looping.

Then message the bot on Telegram: send `/start`, a voice message, and a YouTube link.
Each should come back as a `.md` file.

## Updating

```bash
bash /opt/quiet-transcript/deploy/setup-server.sh
systemctl restart quiet-transcript-bot
```

## Notes and limits

- **20 MB upload cap.** Telegram does not let bots download files larger than this.
  The bot rejects oversized files with an explanatory message instead of failing midway.
- **yt-dlp needs upkeep.** Social sites change and break extraction; re-running
  `setup-server.sh` pulls the current yt-dlp release.
- **One job per chat** at a time, so a single user cannot exhaust the Gladia quota.
- **Logs contain no transcripts or secrets** — only status lines and error reasons.
