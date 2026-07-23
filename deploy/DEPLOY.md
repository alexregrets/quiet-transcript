# Deploying the Telegram bot

The bot is the only workspace that needs a server: it must stay online to poll Telegram.
The desktop app is a Windows binary and the web app is still a stub.

## Prerequisites

1. **A Telegram bot token.** Message [@BotFather](https://t.me/BotFather), send `/newbot`,
   follow the prompts, and copy the token it gives you.
2. **A Gladia API key.** From [gladia.io](https://gladia.io) — the free tier covers about
   10 hours of audio per month.
3. **A Debian or Ubuntu server** with root access.

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

The script writes an empty `/opt/quiet-transcript/.env`. Fill it in:

```bash
cat > /opt/quiet-transcript/.env <<'EOF'
TELEGRAM_BOT_TOKEN=123456:your-token-here
GLADIA_API_KEY=your-gladia-key
EOF
chmod 600 /opt/quiet-transcript/.env
chown quiet:quiet /opt/quiet-transcript/.env
```

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
