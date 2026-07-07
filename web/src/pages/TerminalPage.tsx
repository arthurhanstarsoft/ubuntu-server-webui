import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { SquareTerminal } from 'lucide-react';
import type { Capabilities, TermClientMsg, TermServerMsg } from '@usw/shared';
import { api } from '../lib/api';

const THEME = {
  background: '#131017',
  foreground: '#ece8f1',
  cursor: '#e95420',
  cursorAccent: '#131017',
  selectionBackground: 'rgba(233, 84, 32, 0.35)',
};

export function TerminalPage() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [closed, setClosed] = useState(false);
  const [session, setSession] = useState(0); // bump to reconnect

  const { data: caps } = useQuery({
    queryKey: ['capabilities'],
    queryFn: () => api<Capabilities>('/api/capabilities'),
    staleTime: Infinity,
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !caps?.terminal) return;

    setClosed(false);
    const term = new Terminal({
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 13,
      theme: THEME,
      cursorBlink: true,
      scrollback: 5000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    fit.fit();

    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws/term`);

    const send = (msg: TermClientMsg) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    };

    ws.onopen = () => {
      send({ t: 'resize', cols: term.cols, rows: term.rows });
      term.focus();
    };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data as string) as TermServerMsg;
      if (msg.t === 'output') term.write(msg.data);
      else if (msg.t === 'exit') term.write(`\r\n\x1b[90m[shell exited with code ${msg.code}]\x1b[0m\r\n`);
    };
    ws.onclose = () => setClosed(true);

    const dataSub = term.onData((data) => send({ t: 'input', data }));

    const ro = new ResizeObserver(() => {
      fit.fit();
      send({ t: 'resize', cols: term.cols, rows: term.rows });
    });
    ro.observe(host);

    return () => {
      ro.disconnect();
      dataSub.dispose();
      ws.close();
      term.dispose();
    };
  }, [caps?.terminal, session]);

  if (caps && !caps.terminal) {
    return (
      <div className="p-6">
        <h1 className="mb-4 text-lg font-semibold">Terminal</h1>
        <div className="flex items-center gap-3 rounded-lg border border-line bg-bg1 p-6 text-sm text-mute">
          <SquareTerminal size={18} />
          The terminal isn't available on this host (node-pty not installed). It works when the app runs on the
          Ubuntu server.
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col p-6">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Terminal</h1>
        {closed && (
          <button
            onClick={() => setSession((s) => s + 1)}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-dim"
          >
            Reconnect
          </button>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-line bg-[#131017] p-2">
        <div ref={hostRef} className="h-full w-full" />
      </div>
    </div>
  );
}
