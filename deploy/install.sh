#!/usr/bin/env bash
# Installs the web UI on an Ubuntu server. Run as root from anywhere:
#   sudo bash deploy/install.sh [git-repo-url]
set -euo pipefail

APP_DIR=/opt/ubuntu-server-webui
ENV_FILE=/etc/ubuntu-server-webui.env
UNIT=ubuntu-server-webui.service
REPO_URL="${1:-}"

if [[ $EUID -ne 0 ]]; then
  echo "run as root: sudo bash deploy/install.sh" >&2
  exit 1
fi

echo "==> Installing prerequisites (Node 20, build tools for node-pty, lm-sensors)"
if ! command -v node >/dev/null || [[ "$(node -v | cut -dv -f2 | cut -d. -f1)" -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
apt-get install -y build-essential python3 lm-sensors git

echo "==> Fetching app into $APP_DIR"
if [[ -d "$APP_DIR/.git" ]]; then
  git -C "$APP_DIR" pull --ff-only
elif [[ -n "$REPO_URL" ]]; then
  git clone "$REPO_URL" "$APP_DIR"
else
  # No repo URL: assume we're running from a checkout — copy it over
  SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  if [[ "$SRC" != "$APP_DIR" ]]; then
    mkdir -p "$APP_DIR"
    rsync -a --exclude node_modules --exclude .git "$SRC/" "$APP_DIR/"
  fi
fi

echo "==> Building"
cd "$APP_DIR"
npm ci
npm run build

if [[ ! -f "$ENV_FILE" ]]; then
  echo "==> Creating $ENV_FILE"
  cp .env.example "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  SECRET="$(openssl rand -hex 32)"
  sed -i "s/^SESSION_SECRET=.*/SESSION_SECRET=$SECRET/" "$ENV_FILE"
  echo
  echo "  !! Set the admin password before starting:"
  echo "     cd $APP_DIR && npm run hash-password -- 'yourpassword'"
  echo "     then paste the hash into $ENV_FILE as ADMIN_PASSWORD_HASH="
  echo
fi

echo "==> Installing systemd unit"
cp deploy/$UNIT /etc/systemd/system/$UNIT
systemctl daemon-reload
systemctl enable "$UNIT"

if grep -q '^ADMIN_PASSWORD_HASH=.\+' "$ENV_FILE" || grep -q '^ADMIN_PASSWORD=.\+' "$ENV_FILE"; then
  systemctl restart "$UNIT"
  echo "==> Started. Browse to http://$(hostname -I | awk '{print $1}'):$(grep ^PORT "$ENV_FILE" | cut -d= -f2)"
else
  echo "==> Not started yet — set ADMIN_PASSWORD_HASH in $ENV_FILE, then: systemctl start $UNIT"
fi

echo "==> (Optional) enable temperature sensors: sensors-detect --auto"
