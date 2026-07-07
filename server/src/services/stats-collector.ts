import os from 'node:os';
import si from 'systeminformation';
import type { WebSocket } from 'ws';
import type { StatsSnapshot, StatsServerMsg } from '@usw/shared';

const TICK_MS = 2000;
const DISK_EVERY_TICKS = 15; // fsSize() is slow — refresh every 30s
const HISTORY_SIZE = 120; // 4 minutes at 2s/tick

const SKIP_FS_TYPES = new Set(['squashfs', 'overlay', 'tmpfs', 'devtmpfs', 'efivarfs']);

/**
 * Polls system stats while at least one WebSocket client is subscribed and
 * broadcasts each snapshot. Idle (no clients) costs nothing.
 */
class StatsCollector {
  private clients = new Set<WebSocket>();
  private timer: NodeJS.Timeout | null = null;
  private history: StatsSnapshot[] = [];
  private disks: StatsSnapshot['disks'] = [];
  private ticks = 0;

  subscribe(ws: WebSocket): void {
    this.clients.add(ws);
    this.send(ws, { type: 'history', data: this.history });
    const drop = () => {
      this.clients.delete(ws);
      if (this.clients.size === 0 && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    };
    ws.on('close', drop);
    ws.on('error', drop);
    if (!this.timer) {
      this.ticks = 0;
      this.timer = setInterval(() => void this.tick(), TICK_MS);
      void this.tick();
    }
  }

  private send(ws: WebSocket, msg: StatsServerMsg): void {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  }

  private refreshDisks(): void {
    si.fsSize()
      .then((fsList) => {
        const seen = new Set<string>();
        this.disks = fsList
          .filter((d) => d.size > 0 && !SKIP_FS_TYPES.has(d.type) && !seen.has(d.mount) && (seen.add(d.mount), true))
          .map((d) => ({ fs: d.fs, mount: d.mount, size: d.size, used: d.used, use: d.use }));
      })
      .catch(() => {});
  }

  private async tick(): Promise<void> {
    try {
      if (this.ticks % DISK_EVERY_TICKS === 0) this.refreshDisks();
      this.ticks++;

      const [load, mem, net, temp] = await Promise.all([
        si.currentLoad(),
        si.mem(),
        si.networkStats('*'),
        si.cpuTemperature(),
      ]);

      const snap: StatsSnapshot = {
        t: Date.now(),
        cpu: {
          load: load.currentLoad,
          perCore: load.cpus.map((c) => c.load),
        },
        mem: {
          total: mem.total,
          used: mem.total - mem.available,
          available: mem.available,
          swapTotal: mem.swaptotal,
          swapUsed: mem.swapused,
        },
        net: net
          .filter((n) => n.operstate !== 'down')
          .map((n) => ({ iface: n.iface, rxSec: n.rx_sec ?? 0, txSec: n.tx_sec ?? 0 })),
        temp: typeof temp.main === 'number' && !Number.isNaN(temp.main) ? temp.main : null,
        uptime: os.uptime(),
        disks: this.disks,
      };

      this.history.push(snap);
      if (this.history.length > HISTORY_SIZE) this.history.shift();

      const msg: StatsServerMsg = { type: 'stats', data: snap };
      const payload = JSON.stringify(msg);
      for (const ws of this.clients) {
        if (ws.readyState === ws.OPEN) ws.send(payload);
      }
    } catch (err) {
      console.error('[stats] tick failed:', err);
    }
  }
}

export const statsCollector = new StatsCollector();
