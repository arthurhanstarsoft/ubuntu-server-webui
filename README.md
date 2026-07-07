# ubuntu-server-webui

A self-hosted web console for an Ubuntu home server. Runs on the server itself; browse to `http://<server-ip>:<port>` from any device on your LAN.

**Features**

- **Dashboard** — live CPU, memory, network, temperature, uptime, and per-disk usage, streamed over WebSocket at 2s resolution
- **Services** — list systemd services, start / stop / restart them
- **Processes** — sortable process table with SIGTERM / SIGKILL
- **Files** — browse, upload (drag & drop), download, rename, delete, and edit text files
- **Terminal** — full interactive shell in the browser (xterm.js + node-pty)
- **Auth** — single admin password (bcrypt), session cookie, rate-limited login

## Install on the server

```bash
git clone <this-repo> && cd ubuntu-server-webui
sudo bash deploy/install.sh
```

The script installs Node 20 + build tools, builds the app into `/opt/ubuntu-server-webui`, creates `/etc/ubuntu-server-webui.env` with a generated `SESSION_SECRET`, and installs a systemd unit.

Then set your password and start:

```bash
cd /opt/ubuntu-server-webui
npm run hash-password -- "yourpassword"   # paste output into /etc/ubuntu-server-webui.env
sudo systemctl start ubuntu-server-webui
```

Browse to `http://<server-ip>:8443` (port configurable via `PORT` in the env file).

Optional: run `sudo sensors-detect --auto` once so the temperature tile has data.

## Configuration (`/etc/ubuntu-server-webui.env`)

| Variable | Meaning |
|---|---|
| `PORT` / `HOST` | Listen address (default `8443` / `0.0.0.0`) |
| `ADMIN_PASSWORD_HASH` | bcrypt hash of the admin password (`npm run hash-password -- "pw"`) |
| `SESSION_SECRET` | ≥32-char signing secret (`openssl rand -hex 32`) |
| `FILES_ROOT` | Root of the file browser; nothing outside it is reachable (default `/`) |

## Security notes

- The app runs as **root** by default so it can manage any service, browse any file, and kill any process. If you want less power, run it as a regular user and set `FILES_ROOT=/home/you` — service control and process-kill will then be limited to what that user may do. A sudoers drop-in (`youruser ALL=(root) NOPASSWD: /usr/bin/systemctl start *, /usr/bin/systemctl stop *, /usr/bin/systemctl restart *`) can restore service control.
- Traffic is **plain HTTP**, so the password crosses your LAN unencrypted. Fine on a trusted home network; for anything more, put it behind [Tailscale](https://tailscale.com/) or a reverse proxy with TLS (Caddy makes this a two-liner). Never port-forward this to the internet as-is.
- Login is rate-limited (5 attempts/min per IP) and failed attempts are logged with the source IP (`journalctl -u ubuntu-server-webui`).
- systemctl is invoked with `execFile` and strict unit-name validation — no shell is ever spawned from user input. File paths are resolved and confined to `FILES_ROOT`, symlink escapes included.

## Development (any OS)

```bash
npm install
npm run dev        # API on :3001, UI on http://localhost:5173
```

Dev defaults: password `admin`, file browser rooted at your home directory. On non-Linux hosts the Services page and temperature gracefully report as unavailable; the terminal works if node-pty compiled (on Windows it opens PowerShell).

```
shared/   TypeScript types shared by server and web
server/   Fastify 5 API + WebSockets (tsx in dev, tsup build)
web/      React 19 + Vite + Tailwind 4 frontend
deploy/   systemd unit + install script
```

`npm run build` produces a single-process production app: `node server/dist/index.js` serves the API, WebSockets, and the built frontend on one port.
