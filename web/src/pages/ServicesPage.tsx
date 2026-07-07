import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Play, RotateCw, Search, Square } from 'lucide-react';
import type { Capabilities, ServiceInfo, ServiceVerb } from '@usw/shared';
import { api, ApiError } from '../lib/api';
import { toast } from '../lib/toast';
import { ConfirmDialog } from '../components/ConfirmDialog';

function StatusPill({ active, sub }: { active: string; sub: string }) {
  const color =
    active === 'active' ? 'bg-ok/15 text-ok' : active === 'failed' ? 'bg-err/15 text-err' : 'bg-bg2 text-mute';
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 font-mono text-xs ${color}`}>
      {active === 'active' ? sub : active}
    </span>
  );
}

interface PendingAction {
  unit: string;
  verb: ServiceVerb;
}

export function ServicesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [confirm, setConfirm] = useState<PendingAction | null>(null);

  const { data: caps } = useQuery({
    queryKey: ['capabilities'],
    queryFn: () => api<Capabilities>('/api/capabilities'),
    staleTime: Infinity,
  });

  const { data: services, isLoading } = useQuery({
    queryKey: ['services'],
    queryFn: () => api<ServiceInfo[]>('/api/services'),
    refetchInterval: 10_000,
    enabled: caps?.systemd === true,
  });

  const action = useMutation({
    mutationFn: ({ unit, verb }: PendingAction) =>
      api(`/api/services/${encodeURIComponent(unit)}/${verb}`, { method: 'POST' }),
    onSuccess: (_data, { unit, verb }) => {
      toast('ok', `${verb} ${unit} — done`);
      void qc.invalidateQueries({ queryKey: ['services'] });
    },
    onError: (err, { unit, verb }) => {
      toast('err', err instanceof ApiError ? err.message : `${verb} ${unit} failed`);
    },
  });

  const filtered = useMemo(() => {
    if (!services) return [];
    const q = search.toLowerCase();
    return services.filter((s) => s.unit.toLowerCase().includes(q) || s.description.toLowerCase().includes(q));
  }, [services, search]);

  function request(unit: string, verb: ServiceVerb) {
    if (verb === 'start') {
      action.mutate({ unit, verb });
    } else {
      setConfirm({ unit, verb });
    }
  }

  if (caps && !caps.systemd) {
    return (
      <div className="p-6">
        <h1 className="mb-4 text-lg font-semibold">Services</h1>
        <div className="rounded-lg border border-line bg-bg1 p-6 text-sm text-mute">
          systemd isn't available on this host ({caps.platform}). Service management works when the app runs on the
          Ubuntu server.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <header className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold">Services</h1>
        <div className="relative">
          <Search size={14} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-mute" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter services…"
            className="w-64 rounded-md border border-line bg-bg1 py-1.5 pr-3 pl-8 text-sm outline-none focus:border-accent"
          />
        </div>
      </header>

      <div className="overflow-x-auto rounded-lg border border-line bg-bg1">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs tracking-wide text-mute uppercase">
              <th className="px-4 py-2.5 font-medium">Unit</th>
              <th className="px-4 py-2.5 font-medium">Description</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Boot</th>
              <th className="px-4 py-2.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-mute">
                  Loading services…
                </td>
              </tr>
            )}
            {filtered.map((s) => {
              const busy = action.isPending && action.variables?.unit === s.unit;
              return (
                <tr key={s.unit} className="border-b border-line/50 last:border-0 hover:bg-bg2/40">
                  <td className="max-w-64 truncate px-4 py-2 font-mono text-xs">{s.unit}</td>
                  <td className="max-w-96 truncate px-4 py-2 text-mute">{s.description}</td>
                  <td className="px-4 py-2">
                    <StatusPill active={s.active} sub={s.sub} />
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-mute">{s.enabled ?? '—'}</td>
                  <td className="px-4 py-2">
                    <div className={`flex justify-end gap-1 ${busy ? 'opacity-40' : ''}`}>
                      <button
                        title="Start"
                        disabled={busy || s.active === 'active'}
                        onClick={() => request(s.unit, 'start')}
                        className="rounded p-1.5 text-mute hover:bg-bg2 hover:text-ok disabled:opacity-30"
                      >
                        <Play size={14} />
                      </button>
                      <button
                        title="Stop"
                        disabled={busy || s.active !== 'active'}
                        onClick={() => request(s.unit, 'stop')}
                        className="rounded p-1.5 text-mute hover:bg-bg2 hover:text-err disabled:opacity-30"
                      >
                        <Square size={14} />
                      </button>
                      <button
                        title="Restart"
                        disabled={busy}
                        onClick={() => request(s.unit, 'restart')}
                        className="rounded p-1.5 text-mute hover:bg-bg2 hover:text-warn disabled:opacity-30"
                      >
                        <RotateCw size={14} className={busy ? 'animate-spin' : ''} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-mute">
                  No services match “{search}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {confirm && (
        <ConfirmDialog
          title={`${confirm.verb === 'stop' ? 'Stop' : 'Restart'} service`}
          message={`${confirm.verb} ${confirm.unit}?`}
          confirmLabel={confirm.verb === 'stop' ? 'Stop' : 'Restart'}
          danger={confirm.verb === 'stop'}
          busy={action.isPending}
          onConfirm={() => {
            action.mutate(confirm, { onSettled: () => setConfirm(null) });
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
