/** One tick of live system stats, pushed over /ws/stats every 2s. */
export interface StatsSnapshot {
  /** epoch millis */
  t: number;
  cpu: {
    /** total load 0-100 */
    load: number;
    /** per-core load 0-100 */
    perCore: number[];
  };
  mem: {
    total: number;
    /** total - available: what's genuinely in use */
    used: number;
    available: number;
    swapTotal: number;
    swapUsed: number;
  };
  net: Array<{
    iface: string;
    /** bytes/sec */
    rxSec: number;
    txSec: number;
  }>;
  /** °C, null when no sensor is readable (e.g. Windows dev, VMs) */
  temp: number | null;
  /** seconds */
  uptime: number;
  disks: Array<{
    fs: string;
    mount: string;
    size: number;
    used: number;
    /** 0-100 */
    use: number;
  }>;
}

/** Immutable host facts, fetched once via GET /api/stats/static. */
export interface StaticInfo {
  hostname: string;
  distro: string;
  kernel: string;
  arch: string;
  cpuModel: string;
  cores: number;
  totalMem: number;
}

export interface Capabilities {
  platform: string;
  systemd: boolean;
  terminal: boolean;
}

export interface ServiceInfo {
  unit: string;
  description: string;
  load: string;
  active: string;
  sub: string;
  /** enabled/disabled/static/... from list-unit-files, null if unknown */
  enabled: string | null;
}

export type ServiceVerb = 'start' | 'stop' | 'restart';

export interface ProcInfo {
  pid: number;
  name: string;
  user: string;
  /** percent */
  cpu: number;
  /** percent */
  mem: number;
  command: string;
}

export interface FileEntry {
  name: string;
  type: 'file' | 'dir' | 'symlink' | 'other';
  size: number;
  /** epoch millis */
  mtime: number;
}

export interface FileListing {
  path: string;
  entries: FileEntry[];
  truncated: boolean;
}

/** Server → client frames on /ws/stats */
export type StatsServerMsg =
  | { type: 'history'; data: StatsSnapshot[] }
  | { type: 'stats'; data: StatsSnapshot };

/** Client → server frames on /ws/term */
export type TermClientMsg =
  | { t: 'input'; data: string }
  | { t: 'resize'; cols: number; rows: number };

/** Server → client frames on /ws/term */
export type TermServerMsg =
  | { t: 'output'; data: string }
  | { t: 'exit'; code: number };
