import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownUp, Clock, Cpu, HardDrive, MemoryStick, Thermometer } from 'lucide-react';
import type { StaticInfo } from '@usw/shared';
import type uPlot from 'uplot';
import { api } from '../lib/api';
import { useStatsFeed } from '../lib/statsFeed';
import { fmtBytes, fmtPct, fmtRate, fmtUptime } from '../lib/format';
import { StatTile } from '../components/StatTile';
import { LiveChart } from '../components/LiveChart';

const ACCENT = '#e95420';
const ACCENT_FILL = 'rgba(233, 84, 32, 0.12)';
const CYAN = '#4cc4e0';
const CYAN_FILL = 'rgba(76, 196, 224, 0.10)';

function sumNet(snap: { net: Array<{ rxSec: number; txSec: number }> } | null) {
  if (!snap) return { rx: 0, tx: 0 };
  return snap.net.reduce((acc, n) => ({ rx: acc.rx + n.rxSec, tx: acc.tx + n.txSec }), { rx: 0, tx: 0 });
}

export function DashboardPage() {
  const feed = useStatsFeed();
  const { history, latest } = feed;
  const { data: info } = useQuery({
    queryKey: ['static-info'],
    queryFn: () => api<StaticInfo>('/api/stats/static'),
    staleTime: Infinity,
  });

  const { cpuData, memData, netData } = useMemo(() => {
    const xs = history.map((s) => s.t / 1000);
    return {
      cpuData: [xs, history.map((s) => s.cpu.load)] as uPlot.AlignedData,
      memData: [xs, history.map((s) => (s.mem.used / s.mem.total) * 100)] as uPlot.AlignedData,
      netData: [
        xs,
        history.map((s) => sumNet(s).rx),
        history.map((s) => sumNet(s).tx),
      ] as uPlot.AlignedData,
    };
  }, [history]);

  const net = sumNet(latest);
  const memPct = latest ? (latest.mem.used / latest.mem.total) * 100 : 0;

  return (
    <div className="space-y-4 p-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-lg font-semibold">Dashboard</h1>
        <span className="font-mono text-xs text-mute">
          {info ? `${info.cpuModel} · ${info.cores} cores · ${info.kernel}` : ''}
        </span>
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatTile
          icon={Cpu}
          label="CPU"
          value={latest ? fmtPct(latest.cpu.load) : '—'}
          sub={info ? `${info.cores} cores` : undefined}
          pct={latest?.cpu.load ?? 0}
        />
        <StatTile
          icon={MemoryStick}
          label="Memory"
          value={latest ? fmtBytes(latest.mem.used) : '—'}
          sub={latest ? `of ${fmtBytes(latest.mem.total)}` : undefined}
          pct={memPct}
        />
        <StatTile
          icon={Thermometer}
          label="Temp"
          value={latest?.temp != null ? `${Math.round(latest.temp)}°C` : '—'}
          sub={latest?.temp == null ? 'no sensor' : undefined}
        />
        <StatTile icon={Clock} label="Uptime" value={latest ? fmtUptime(latest.uptime) : '—'} />
        <StatTile
          icon={ArrowDownUp}
          label="Network"
          value={latest ? `↓ ${fmtRate(net.rx)}` : '—'}
          sub={latest ? `↑ ${fmtRate(net.tx)}` : undefined}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <LiveChart
          title="CPU load"
          data={cpuData}
          series={[{ label: 'load', stroke: ACCENT, fill: ACCENT_FILL }]}
          yRange={[0, 100]}
          formatY={(v) => `${v}%`}
        />
        <LiveChart
          title="Memory"
          data={memData}
          series={[{ label: 'used', stroke: CYAN, fill: CYAN_FILL }]}
          yRange={[0, 100]}
          formatY={(v) => `${v}%`}
        />
      </div>

      <LiveChart
        title="Network throughput"
        data={netData}
        series={[
          { label: 'down', stroke: ACCENT, fill: ACCENT_FILL },
          { label: 'up', stroke: CYAN, fill: CYAN_FILL },
        ]}
        formatY={(v) => fmtBytes(v)}
        height={160}
      />

      {latest && latest.disks.length > 0 && (
        <div className="rounded-lg border border-line bg-bg1 p-4">
          <div className="mb-3 flex items-center gap-2 text-mute">
            <HardDrive size={14} />
            <span className="text-xs font-medium tracking-wide uppercase">Disks</span>
          </div>
          <div className="grid grid-cols-1 gap-x-8 gap-y-3 md:grid-cols-2">
            {latest.disks.map((d) => (
              <div key={d.mount}>
                <div className="mb-1 flex items-baseline justify-between font-mono text-xs">
                  <span className="truncate">{d.mount}</span>
                  <span className="ml-2 shrink-0 text-mute">
                    {fmtBytes(d.used)} / {fmtBytes(d.size)} · {fmtPct(d.use)}
                  </span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-bg2">
                  <div
                    className={`h-full rounded-full ${d.use >= 90 ? 'bg-err' : d.use >= 75 ? 'bg-warn' : 'bg-accent'}`}
                    style={{ width: `${d.use}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
