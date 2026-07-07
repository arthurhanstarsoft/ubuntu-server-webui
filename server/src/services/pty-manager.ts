import os from 'node:os';
import { AppError } from '../lib/errors';

/** Minimal surface of node-pty we use — avoids a hard type dependency on an optional module. */
export interface PtySession {
  pid: number;
  onData(cb: (data: string) => void): void;
  onExit(cb: (e: { exitCode: number }) => void): void;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
}

interface PtyModule {
  spawn(file: string, args: string[], opts: object): PtySession;
}

const MAX_SESSIONS = 5;
let activeSessions = 0;

// node-pty is an optionalDependency: it may be absent (e.g. Windows dev box
// without build tools). Lazy-load once and cache the result.
let ptyModule: PtyModule | null | undefined;

async function loadPty(): Promise<PtyModule | null> {
  if (ptyModule !== undefined) return ptyModule;
  try {
    ptyModule = (await import('node-pty')) as unknown as PtyModule;
  } catch {
    ptyModule = null;
  }
  return ptyModule;
}

export async function ptyAvailable(): Promise<boolean> {
  return (await loadPty()) !== null;
}

export async function spawnShell(cols: number, rows: number): Promise<PtySession> {
  const pty = await loadPty();
  if (!pty) throw new AppError(501, 'terminal is not available on this host');
  if (activeSessions >= MAX_SESSIONS) throw new AppError(429, `too many open terminals (limit ${MAX_SESSIONS})`);

  const shell =
    process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/bash';
  const args = process.platform === 'win32' ? [] : ['-l'];

  const session = pty.spawn(shell, args, {
    name: 'xterm-256color',
    cols: Math.max(2, Math.min(cols, 500)),
    rows: Math.max(2, Math.min(rows, 300)),
    cwd: os.homedir(),
    env: process.env,
  });
  activeSessions++;
  session.onExit(() => {
    activeSessions = Math.max(0, activeSessions - 1);
  });
  return session;
}
