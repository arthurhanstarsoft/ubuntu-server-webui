import si from 'systeminformation';
import type { ProcInfo } from '@usw/shared';
import { AppError } from '../lib/errors';

const MAX_PROCESSES = 300;

export async function listProcesses(): Promise<ProcInfo[]> {
  const data = await si.processes();
  return data.list
    .sort((a, b) => b.cpu - a.cpu || b.mem - a.mem)
    .slice(0, MAX_PROCESSES)
    .map((p) => ({
      pid: p.pid,
      name: p.name,
      user: p.user ?? '',
      cpu: p.cpu,
      mem: p.mem,
      command: [p.command, p.params].filter(Boolean).join(' ').slice(0, 300),
    }));
}

export function killProcess(pid: number, signal: 'SIGTERM' | 'SIGKILL'): void {
  if (!Number.isInteger(pid) || pid <= 1) throw new AppError(400, 'invalid pid');
  if (pid === process.pid) throw new AppError(400, 'refusing to kill the web UI server process');
  try {
    process.kill(pid, signal);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ESRCH') throw new AppError(404, `no such process: ${pid}`);
    if (code === 'EPERM') throw new AppError(403, `not permitted to signal pid ${pid}`);
    throw err;
  }
}
