import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

export const isLinux = process.platform === 'linux';

let systemdAvailable: boolean | null = null;

export async function hasSystemd(): Promise<boolean> {
  if (systemdAvailable !== null) return systemdAvailable;
  if (!isLinux) {
    systemdAvailable = false;
    return false;
  }
  try {
    await run('systemctl', ['--version'], { timeout: 5000 });
    systemdAvailable = true;
  } catch {
    systemdAvailable = false;
  }
  return systemdAvailable;
}
