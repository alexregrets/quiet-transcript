#!/usr/bin/env bash
#
# Provisions a Debian/Ubuntu server to run the Quiet Transcript Telegram bot.
# Idempotent: safe to re-run to pick up new commits.
#
#   sudo bash setup-server.sh
#
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/quiet-transcript}
REPO_URL=${REPO_URL:-https://github.com/alexregrets/quiet-transcript}
BRANCH=${BRANCH:-main}
SERVICE_USER=${SERVICE_USER:-quiet}
SERVICE_NAME=quiet-transcript-bot

log() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this as root (sudo bash setup-server.sh)." >&2
  exit 1
fi

log "Installing system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
# ffmpeg is required by yt-dlp's --extract-audio.
apt-get install -y -qq --no-install-recommends ca-certificates curl git ffmpeg

log "Installing Node.js"
NODE_MAJOR=0
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR=$(node -v | sed 's/^v//' | cut -d. -f1)
fi

if [ "$NODE_MAJOR" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi
node -v

log "Installing pnpm"
npm install -g --silent pnpm@9.15.4
pnpm --version

log "Installing yt-dlp"
# Taken from upstream rather than apt: distro builds lag behind and break on
# social sites within weeks. Re-running this script also upgrades it.
curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
  -o /usr/local/bin/yt-dlp
chmod a+rx /usr/local/bin/yt-dlp
yt-dlp --version

log "Creating service user"
if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
  useradd --system --create-home --shell /usr/sbin/nologin "$SERVICE_USER"
fi

log "Fetching the repository"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch --depth 1 origin "$BRANCH"
  git -C "$APP_DIR" reset --hard "origin/$BRANCH"
else
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi

log "Installing dependencies"
# Dev dependencies are needed: the bot runs through tsx rather than a compiled bundle.
cd "$APP_DIR"
pnpm install --frozen-lockfile

if [ ! -f "$APP_DIR/.env" ]; then
  log "No .env found — creating a template"
  cat > "$APP_DIR/.env" <<'ENVTEMPLATE'
TELEGRAM_BOT_TOKEN=
GLADIA_API_KEY=
ENVTEMPLATE
  echo "Fill in $APP_DIR/.env before starting the service."
fi

chmod 600 "$APP_DIR/.env"
chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"

log "Installing the systemd unit"
install -m 644 "$APP_DIR/deploy/$SERVICE_NAME.service" "/etc/systemd/system/$SERVICE_NAME.service"
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"

log "Done"
cat <<SUMMARY

Next:
  1. Put real values in $APP_DIR/.env (TELEGRAM_BOT_TOKEN, GLADIA_API_KEY)
  2. systemctl restart $SERVICE_NAME
  3. systemctl status $SERVICE_NAME
  4. journalctl -u $SERVICE_NAME -f

SUMMARY
