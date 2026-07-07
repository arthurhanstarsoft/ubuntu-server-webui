import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

export interface ChartSeries {
  label: string;
  stroke: string;
  fill?: string;
}

interface Props {
  title: string;
  data: uPlot.AlignedData;
  series: ChartSeries[];
  /** fixed y range, e.g. [0, 100] for percentages */
  yRange?: [number, number];
  formatY?: (v: number) => string;
  height?: number;
}

const AXIS_FONT = '11px JetBrains Mono';
const GRID = { stroke: '#2e2637', width: 1 } as const;
const TICK = { stroke: '#2e2637', width: 1 } as const;

export function LiveChart({ title, data, series, yRange, formatY, height = 180 }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const fmt = formatY ?? ((v: number) => String(Math.round(v)));
    const opts: uPlot.Options = {
      width: host.clientWidth,
      height,
      legend: { show: false },
      cursor: { y: false },
      scales: {
        x: { time: true },
        y: yRange ? { range: yRange } : { range: (_u, min, max) => [0, Math.max(max * 1.15, min + 1)] },
      },
      axes: [
        { stroke: '#9c92a8', font: AXIS_FONT, grid: { show: false }, ticks: TICK },
        {
          stroke: '#9c92a8',
          font: AXIS_FONT,
          grid: GRID,
          ticks: TICK,
          size: 68,
          values: (_u, ticks) => ticks.map(fmt),
        },
      ],
      series: [
        {},
        ...series.map((s) => ({
          label: s.label,
          stroke: s.stroke,
          fill: s.fill,
          width: 1.5,
          points: { show: false },
        })),
      ],
    };

    const plot = new uPlot(opts, dataRef.current, host);
    plotRef.current = plot;

    const ro = new ResizeObserver(() => {
      plot.setSize({ width: host.clientWidth, height });
    });
    ro.observe(host);

    return () => {
      ro.disconnect();
      plot.destroy();
      plotRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height, yRange?.[0], yRange?.[1]]);

  useEffect(() => {
    plotRef.current?.setData(data);
  }, [data]);

  return (
    <div className="rounded-lg border border-line bg-bg1 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium tracking-wide text-mute uppercase">{title}</span>
        <span className="flex items-center gap-3">
          {series.length > 1 &&
            series.map((s) => (
              <span key={s.label} className="flex items-center gap-1.5 text-xs text-mute">
                <span className="h-0.5 w-3 rounded" style={{ background: s.stroke }} />
                {s.label}
              </span>
            ))}
        </span>
      </div>
      <div ref={hostRef} />
    </div>
  );
}
