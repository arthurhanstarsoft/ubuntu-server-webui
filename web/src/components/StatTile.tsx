import type { LucideIcon } from 'lucide-react';

interface Props {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  /** 0-100 fill for the bottom bar; omit to hide */
  pct?: number;
}

function barColor(pct: number): string {
  if (pct >= 90) return 'bg-err';
  if (pct >= 75) return 'bg-warn';
  return 'bg-accent';
}

export function StatTile({ icon: Icon, label, value, sub, pct }: Props) {
  return (
    <div className="rounded-lg border border-line bg-bg1 p-4">
      <div className="flex items-center gap-2 text-mute">
        <Icon size={14} />
        <span className="text-xs font-medium tracking-wide uppercase">{label}</span>
      </div>
      <div className="mt-2 font-mono text-2xl font-semibold">{value}</div>
      {sub && <div className="mt-0.5 truncate font-mono text-xs text-mute">{sub}</div>}
      {pct !== undefined && (
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-bg2">
          <div
            className={`h-full rounded-full transition-[width] duration-500 ${barColor(pct)}`}
            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
          />
        </div>
      )}
    </div>
  );
}
