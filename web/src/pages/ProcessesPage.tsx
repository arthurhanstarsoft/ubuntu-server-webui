import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Skull, X } from 'lucide-react';
import type { ProcInfo } from '@usw/shared';
import { api, ApiError } from '../lib/api';
import { toast } from '../lib/toast';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { fmtPct } from '../lib/format';

type SortKey = 'cpu' | 'mem';

interface PendingKill {
  proc: ProcInfo;
  signal: 'SIGTERM' | 'SIGKILL';
}

export function ProcessesPage() {
  const qc = useQueryClient();
  const [sortKey, setSortKey] = useState<SortKey>('cpu');
  const [search, setSearch] = useState('');
  const [confirm, setConfirm] = useState<PendingKill | null>(null);

  const { data: procs, isLoading } = useQuery({
    queryKey: ['processes'],
    queryFn: () => api<ProcInfo[]>('/api/processes'),
    refetchInterval: 5000,
  });

  const kill = useMutation({
    mutationFn: ({ proc, signal }: PendingKill) =>
      api(`/api/processes/${proc.pid}/kill`, { method: 'POST', body: JSON.stringify({ signal }) }),
    onSuccess: (_d, { proc, signal }) => {
      toast('ok', `sent ${signal} to ${proc.name} (${proc.pid})`);
      void qc.invalidateQueries({ queryKey: ['processes'] });
    },
    onError: (err) => toast('err', err instanceof ApiError ? err.message : 'kill failed'),
  });

  const rows = useMemo(() => {
    if (!procs) return [];
    const q = search.toLowerCase();
    return procs
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.command.toLowerCase().includes(q) || String(p.pid) === q)
      .sort((a, b) => b[sortKey] - a[sortKey]);
  }, [procs, search, sortKey]);

  const headerBtn = (key: SortKey, label: string) => (
    <button
      onClick={() => setSortKey(key)}
      className={`font-medium uppercase ${sortKey === key ? 'text-accent' : 'text-mute hover:text-text'}`}
    >
      {label}
      {sortKey === key ? ' ▾' : ''}
    </button>
  );

  return (
    <div className="p-6">
      <header className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold">Processes</h1>
        <div className="relative">
          <Search size={14} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-mute" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by name, command, pid…"
            className="w-72 rounded-md border border-line bg-bg1 py-1.5 pr-3 pl-8 text-sm outline-none focus:border-accent"
          />
        </div>
      </header>

      <div className="overflow-x-auto rounded-lg border border-line bg-bg1">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs tracking-wide text-mute uppercase">
              <th className="px-4 py-2.5 font-medium">PID</th>
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">User</th>
              <th className="px-4 py-2.5">{headerBtn('cpu', 'CPU')}</th>
              <th className="px-4 py-2.5">{headerBtn('mem', 'Mem')}</th>
              <th className="px-4 py-2.5 font-medium">Command</th>
              <th className="px-4 py-2.5 text-right font-medium">Kill</th>
            </tr>
          </thead>
          <tbody className="font-mono text-xs">
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center font-sans text-sm text-mute">
                  Loading processes…
                </td>
              </tr>
            )}
            {rows.map((p) => (
              <tr key={p.pid} className="border-b border-line/50 last:border-0 hover:bg-bg2/40">
                <td className="px-4 py-1.5 text-mute">{p.pid}</td>
                <td className="max-w-48 truncate px-4 py-1.5">{p.name}</td>
                <td className="px-4 py-1.5 text-mute">{p.user}</td>
                <td className={`px-4 py-1.5 ${p.cpu >= 50 ? 'text-warn' : ''}`}>{fmtPct(p.cpu)}</td>
                <td className={`px-4 py-1.5 ${p.mem >= 50 ? 'text-warn' : ''}`}>{fmtPct(p.mem)}</td>
                <td className="max-w-md truncate px-4 py-1.5 text-mute" title={p.command}>
                  {p.command}
                </td>
                <td className="px-4 py-1.5">
                  <div className="flex justify-end gap-1">
                    <button
                      title="Terminate (SIGTERM)"
                      onClick={() => setConfirm({ proc: p, signal: 'SIGTERM' })}
                      className="rounded p-1 text-mute hover:bg-bg2 hover:text-warn"
                    >
                      <X size={13} />
                    </button>
                    <button
                      title="Force kill (SIGKILL)"
                      onClick={() => setConfirm({ proc: p, signal: 'SIGKILL' })}
                      className="rounded p-1 text-mute hover:bg-bg2 hover:text-err"
                    >
                      <Skull size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center font-sans text-sm text-mute">
                  No processes match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {confirm && (
        <ConfirmDialog
          title={confirm.signal === 'SIGKILL' ? 'Force kill process' : 'Terminate process'}
          message={`Send ${confirm.signal} to ${confirm.proc.name} (pid ${confirm.proc.pid})?`}
          confirmLabel={confirm.signal === 'SIGKILL' ? 'Force kill' : 'Terminate'}
          danger
          busy={kill.isPending}
          onConfirm={() => kill.mutate(confirm, { onSettled: () => setConfirm(null) })}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
