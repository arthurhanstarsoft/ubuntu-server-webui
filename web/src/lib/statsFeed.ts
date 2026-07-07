import { useSyncExternalStore } from 'react';
import type { StatsSnapshot, StatsServerMsg } from '@usw/shared';

export type FeedStatus = 'connecting' | 'live' | 'offline';

const MAX_BACKOFF_MS = 15_000;

/**
 * Singleton client for /ws/stats. Connects while at least one component is
 * subscribed, reconnects with exponential backoff, and keeps the rolling
 * history the charts render from.
 */
class StatsFeed {
  history: StatsSnapshot[] = [];
  latest: StatsSnapshot | null = null;
  status: FeedStatus = 'offline';

  private version = 0;
  private listeners = new Set<() => void>();
  private ws: WebSocket | null = null;
  private refs = 0;
  private backoff = 1000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private failedAttempts = 0;

  subscribe = (onChange: () => void): (() => void) => {
    this.listeners.add(onChange);
    this.refs++;
    if (this.refs === 1) this.connect();
    return () => {
      this.listeners.delete(onChange);
      this.refs--;
      if (this.refs === 0) this.disconnect();
    };
  };

  getVersion = (): number => this.version;

  private emit(): void {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  private connect(): void {
    if (this.ws) return;
    this.status = 'connecting';
    this.emit();
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws/stats`);
    this.ws = ws;

    ws.onopen = () => {
      this.status = 'live';
      this.backoff = 1000;
      this.failedAttempts = 0;
      this.emit();
    };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data as string) as StatsServerMsg;
      if (msg.type === 'history') {
        this.history = msg.data;
      } else {
        this.history.push(msg.data);
        if (this.history.length > 120) this.history.shift();
      }
      this.latest = this.history[this.history.length - 1] ?? null;
      this.emit();
    };
    ws.onclose = () => {
      this.ws = null;
      this.status = 'offline';
      this.emit();
      if (this.refs > 0) {
        this.failedAttempts++;
        if (this.failedAttempts >= 3) this.checkSession();
        this.reconnectTimer = setTimeout(() => this.connect(), this.backoff);
        this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF_MS);
      }
    };
  }

  /** Repeated WS failures usually mean the session expired — bounce to login if so. */
  private checkSession(): void {
    void fetch('/api/auth/me').then((res) => {
      if (res.status === 401 && !location.pathname.startsWith('/login')) {
        location.assign('/login');
      }
    });
  }

  private disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.ws?.close();
    this.ws = null;
    this.status = 'offline';
  }
}

export const statsFeed = new StatsFeed();

/** Re-renders the component on every stats tick (2 Hz). */
export function useStatsFeed(): StatsFeed {
  useSyncExternalStore(statsFeed.subscribe, statsFeed.getVersion);
  return statsFeed;
}
