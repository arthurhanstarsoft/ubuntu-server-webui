import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';

// Dev convenience: pick up a .env from the workspace or repo root. In
// production the environment comes from systemd's EnvironmentFile.
for (const candidate of ['.env', '../.env']) {
  if (existsSync(candidate)) {
    process.loadEnvFile(candidate);
    break;
  }
}

const isProd = process.env.NODE_ENV === 'production';
const isLinux = process.platform === 'linux';

function fail(msg: string): never {
  console.error(`[config] ${msg}`);
  process.exit(1);
}

function resolveSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (secret) {
    fail('SESSION_SECRET must be at least 32 characters. Generate one with: openssl rand -hex 32');
  }
  if (isProd) {
    fail('SESSION_SECRET is required in production. Generate one with: openssl rand -hex 32');
  }
  console.warn('[config] SESSION_SECRET not set — using an insecure dev-only secret');
  return 'insecure-dev-only-secret-0123456789abcdef';
}

function resolvePasswordHash(): string {
  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (hash) return hash;
  const plain = process.env.ADMIN_PASSWORD;
  if (plain) {
    console.warn(
      '[config] ADMIN_PASSWORD is plaintext in the environment — prefer ADMIN_PASSWORD_HASH (npm run hash-password -- "yourpassword")',
    );
    return bcrypt.hashSync(plain, 12);
  }
  if (isProd) {
    fail('Set ADMIN_PASSWORD_HASH (preferred) or ADMIN_PASSWORD. Generate a hash with: npm run hash-password -- "yourpassword"');
  }
  console.warn('[config] No admin password configured — dev default password is "admin"');
  return bcrypt.hashSync('admin', 10);
}

export const config = {
  isProd,
  isLinux,
  port: Number(process.env.PORT ?? 3001),
  host: process.env.HOST ?? '0.0.0.0',
  sessionSecret: resolveSessionSecret(),
  passwordHash: resolvePasswordHash(),
  // Root of the file browser. Defaults to / on Linux; on Windows dev, the
  // user's home directory keeps testing contained.
  filesRoot: path.resolve(process.env.FILES_ROOT ?? (isLinux ? '/' : os.homedir())),
  // The app's own systemd unit, protected from stop/restart via the UI.
  ownUnit: process.env.OWN_UNIT ?? 'ubuntu-server-webui.service',
};
