import os from 'node:os';
import type { FastifyInstance } from 'fastify';
import si from 'systeminformation';
import type { StaticInfo, Capabilities } from '@usw/shared';
import { statsCollector } from '../services/stats-collector';
import { ptyAvailable } from '../services/pty-manager';
import { hasSystemd } from '../platform';

export async function statsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/capabilities', async (): Promise<Capabilities> => ({
    platform: process.platform,
    systemd: await hasSystemd(),
    terminal: await ptyAvailable(),
  }));

  app.get('/api/stats/static', async (): Promise<StaticInfo> => {
    const [osInfo, cpu, mem] = await Promise.all([si.osInfo(), si.cpu(), si.mem()]);
    return {
      hostname: os.hostname(),
      distro: `${osInfo.distro} ${osInfo.release}`.trim(),
      kernel: osInfo.kernel,
      arch: osInfo.arch,
      cpuModel: `${cpu.manufacturer} ${cpu.brand}`.trim(),
      cores: cpu.cores,
      totalMem: mem.total,
    };
  });

  app.get('/ws/stats', { websocket: true }, (socket) => {
    statsCollector.subscribe(socket);
  });
}
