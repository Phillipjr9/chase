/* -------------------------------------------------------------------------- */
/* Admin Console — dependency-free SVG charts                                  */
/* Patterned after TailAdmin / Mosaic style metric + chart cards.              */
/* -------------------------------------------------------------------------- */
import React, { useId, useMemo, useState } from 'react';

export const CHART_COLORS = [
  '#0060F0',
  '#12B76A',
  '#F79009',
  '#7A5AF8',
  '#0BA5EC',
  '#D92D20',
  '#EC4899',
  '#84CC16',
];

export const ACCOUNT_TYPE_COLORS: Record<string, string> = {
  checking: '#0060F0',
  savings: '#12B76A',
  'credit-card': '#7A5AF8',
  cd: '#0BA5EC',
  mortgage: '#F79009',
  'auto-loan': '#EC4899',
};

export function fmtCompactMoney(n: number | null | undefined): string {
  const num = typeof n === 'number' ? n : Number(n ?? 0);
  const safe = Number.isFinite(num) ? num : 0;
  const abs = Math.abs(safe);
  const sign = safe < 0 ? '−' : '';
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(abs >= 100_000 ? 0 : 1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function niceCeil(v: number): number {
  if (v <= 0) return 10;
  const exp = Math.floor(Math.log10(v));
  const base = Math.pow(10, exp);
  const frac = v / base;
  const nice = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 2.5 ? 2.5 : frac <= 5 ? 5 : 10;
  return nice * base;
}

/** Catmull-Rom → cubic bezier smoothing for professional-looking curves. */
function smoothPath(pts: [number, number][]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}

/* ------------------------------- Sparkline -------------------------------- */

export const Sparkline: React.FC<{
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}> = ({ data, color = '#0060F0', width = 120, height = 36 }) => {
  const gid = useId();
  const pts = useMemo(() => {
    if (!data.length) return [] as [number, number][];
    const max = Math.max(...data);
    const min = Math.min(...data);
    const span = max - min || 1;
    const step = data.length > 1 ? width / (data.length - 1) : width;
    return data.map((v, i) => [i * step, height - 4 - ((v - min) / span) * (height - 10)] as [number, number]);
  }, [data, width, height]);
  if (pts.length < 2) return <svg width={width} height={height} aria-hidden="true" />;
  const line = smoothPath(pts);
  const area = `${line} L ${pts[pts.length - 1][0]} ${height} L ${pts[0][0]} ${height} Z`;
  const last = pts[pts.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="overflow-visible">
      <defs>
        <linearGradient id={`spark-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#spark-${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2.8" fill={color} />
    </svg>
  );
};

/* ------------------------------- Area chart -------------------------------- */

export interface AreaPoint {
  label: string;
  a: number;
  b: number;
}

export const AreaChart: React.FC<{
  data: AreaPoint[];
  aLabel: string;
  bLabel: string;
  aColor?: string;
  bColor?: string;
  height?: number;
  valueFmt?: (n: number) => string;
}> = ({ data, aLabel, bLabel, aColor = '#0060F0', bColor = '#F04438', height = 280, valueFmt = fmtCompactMoney }) => {
  const gid = useId();
  const [hover, setHover] = useState<number | null>(null);
  const W = 760;
  const H = height;
  const padL = 58;
  const padR = 14;
  const padT = 14;
  const padB = 30;

  const yMax = niceCeil(Math.max(1, ...data.map((d) => Math.max(d.a, d.b))));
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const stepX = data.length > 1 ? plotW / (data.length - 1) : plotW;
  const x = (i: number) => padL + i * stepX;
  const y = (v: number) => padT + plotH - (v / yMax) * plotH;

  const lineA = smoothPath(data.map((d, i) => [x(i), y(d.a)] as [number, number]));
  const lineB = smoothPath(data.map((d, i) => [x(i), y(d.b)] as [number, number]));
  const areaA = data.length ? `${lineA} L ${x(data.length - 1)} ${padT + plotH} L ${x(0)} ${padT + plotH} Z` : '';
  const areaB = data.length ? `${lineB} L ${x(data.length - 1)} ${padT + plotH} L ${x(0)} ${padT + plotH} Z` : '';
  const gridVals = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax);
  /* Thin x-labels adaptively so dense ranges (30 daily buckets) stay readable. */
  const labelEvery = Math.max(2, Math.ceil(data.length / 12));

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const vx = ((e.clientX - rect.left) / rect.width) * W;
    const idx = Math.round((vx - padL) / (stepX || 1));
    setHover(idx >= 0 && idx < data.length ? idx : null);
  };

  const tip = hover !== null ? data[hover] : null;
  const tipX = hover !== null ? x(hover) : 0;
  const tipFlip = tipX > W - 170;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto select-none"
      onMouseMove={onMove}
      onMouseLeave={() => setHover(null)}
      role="img"
      aria-label={`${aLabel} versus ${bLabel} over ${data.length} periods`}
    >
      <defs>
        <linearGradient id={`areaA-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={aColor} stopOpacity="0.25" />
          <stop offset="100%" stopColor={aColor} stopOpacity="0.02" />
        </linearGradient>
        <linearGradient id={`areaB-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={bColor} stopOpacity="0.20" />
          <stop offset="100%" stopColor={bColor} stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {gridVals.map((v) => (
        <g key={v}>
          <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="currentColor" className="text-gray-200 dark:text-gray-700/60" strokeWidth="1" />
          <text x={padL - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="currentColor" className="text-gray-400 dark:text-gray-500">
            {valueFmt(v)}
          </text>
        </g>
      ))}

      {data.map((d, i) =>
        i % labelEvery === 0 || i === data.length - 1 ? (
          <text key={d.label + i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="currentColor" className="text-gray-400 dark:text-gray-500">
            {d.label}
          </text>
        ) : null
      )}

      <path d={areaB} fill={`url(#areaB-${gid})`} />
      <path d={areaA} fill={`url(#areaA-${gid})`} />
      <path d={lineB} fill="none" stroke={bColor} strokeWidth="2.2" strokeLinecap="round" />
      <path d={lineA} fill="none" stroke={aColor} strokeWidth="2.2" strokeLinecap="round" />

      {hover !== null && tip && (
        <g>
          <line x1={tipX} x2={tipX} y1={padT} y2={padT + plotH} stroke="currentColor" className="text-gray-300 dark:text-gray-600" strokeWidth="1" strokeDasharray="4 3" />
          <circle cx={tipX} cy={y(tip.a)} r="4.5" fill={aColor} stroke="#fff" strokeWidth="2" />
          <circle cx={tipX} cy={y(tip.b)} r="4.5" fill={bColor} stroke="#fff" strokeWidth="2" />
          <g transform={`translate(${tipFlip ? tipX - 158 : tipX + 12}, ${padT + 6})`}>
            <rect width="146" height="62" rx="8" className="fill-white dark:fill-gray-900" strokeWidth="1" style={{ stroke: 'rgba(120,130,150,0.35)' }} />
            <text x="10" y="18" fontSize="11" fontWeight="600" fill="currentColor" className="text-gray-700 dark:text-gray-200">{tip.label}</text>
            <circle cx="14" cy="32" r="4" fill={aColor} />
            <text x="24" y="36" fontSize="11" fill="currentColor" className="text-gray-500 dark:text-gray-400">{aLabel}: {valueFmt(tip.a)}</text>
            <circle cx="14" cy="48" r="4" fill={bColor} />
            <text x="24" y="52" fontSize="11" fill="currentColor" className="text-gray-500 dark:text-gray-400">{bLabel}: {valueFmt(tip.b)}</text>
          </g>
        </g>
      )}
    </svg>
  );
};

/* -------------------------------- Bar chart -------------------------------- */

export interface BarPoint {
  label: string;
  value: number;
  meta?: string;
}

export const BarChart: React.FC<{
  data: BarPoint[];
  color?: string;
  height?: number;
  valueFmt?: (n: number) => string;
}> = ({ data, color = '#0060F0', height = 260, valueFmt = fmtCompactMoney }) => {
  const gid = useId();
  const [hover, setHover] = useState<number | null>(null);
  const W = 760;
  const H = height;
  const padL = 58;
  const padR = 14;
  const padT = 14;
  const padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const yMax = niceCeil(Math.max(1, ...data.map((d) => d.value)));
  const step = data.length ? plotW / data.length : plotW;
  const barW = Math.min(34, step * 0.56);
  const y = (v: number) => padT + plotH - (v / yMax) * plotH;
  const gridVals = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto select-none" role="img" aria-label="Bar chart">
      <defs>
        <linearGradient id={`bar-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.95" />
          <stop offset="100%" stopColor={color} stopOpacity="0.55" />
        </linearGradient>
      </defs>
      {gridVals.map((v) => (
        <g key={v}>
          <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="currentColor" className="text-gray-200 dark:text-gray-700/60" strokeWidth="1" />
          <text x={padL - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="currentColor" className="text-gray-400 dark:text-gray-500">
            {valueFmt(v)}
          </text>
        </g>
      ))}
      {data.map((d, i) => {
        const cx = padL + i * step + step / 2;
        const h = Math.max(2, padT + plotH - y(d.value));
        return (
          <g key={d.label + i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <rect x={padL + i * step} y={padT} width={step} height={plotH} fill="transparent" />
            <rect
              x={cx - barW / 2}
              y={y(d.value)}
              width={barW}
              height={h}
              rx={Math.min(5, barW / 2)}
              fill={`url(#bar-${gid})`}
              opacity={hover === null || hover === i ? 1 : 0.45}
              className="transition-opacity"
            />
            {(i % 2 === 0 || i === data.length - 1) && (
              <text x={cx} y={H - 8} textAnchor="middle" fontSize="11" fill="currentColor" className="text-gray-400 dark:text-gray-500">
                {d.label}
              </text>
            )}
            {hover === i && (
              <g transform={`translate(${Math.min(Math.max(cx - 62, padL), W - padR - 124)}, ${Math.max(y(d.value) - 52, 4)})`}>
                <rect width="124" height="42" rx="8" className="fill-white dark:fill-gray-900" style={{ stroke: 'rgba(120,130,150,0.35)' }} />
                <text x="10" y="17" fontSize="11" fontWeight="600" fill="currentColor" className="text-gray-700 dark:text-gray-200">
                  {valueFmt(d.value)}
                </text>
                <text x="10" y="33" fontSize="10.5" fill="currentColor" className="text-gray-400 dark:text-gray-500">
                  {d.meta || d.label}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
};

/* ------------------------------- Donut chart ------------------------------- */

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
  meta?: string;
}

export const DonutChart: React.FC<{
  slices: DonutSlice[];
  centerValue: string;
  centerLabel: string;
  size?: number;
}> = ({ slices, centerValue, centerLabel, size = 190 }) => {
  const [hover, setHover] = useState<number | null>(null);
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const r = 70;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox="0 0 190 190" width={size} height={size} role="img" aria-label="Donut chart">
          <circle cx="95" cy="95" r={r} fill="none" strokeWidth="22" className="stroke-gray-100 dark:stroke-gray-800" />
          {slices.map((s, i) => {
            const frac = s.value / total;
            const dash = Math.max(0, frac * c - 3);
            const el = (
              <circle
                key={s.label}
                cx="95"
                cy="95"
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={hover === i ? 26 : 22}
                strokeDasharray={`${dash} ${c - dash}`}
                strokeDashoffset={-offset}
                strokeLinecap="round"
                transform="rotate(-90 95 95)"
                className="transition-all cursor-default"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            );
            offset += frac * c;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
          {hover !== null ? (
            <>
              <span className="text-xl font-bold text-gray-800 dark:text-white/90">{slices[hover].value}</span>
              <span className="text-[11px] text-gray-500 dark:text-gray-400 max-w-[90px] leading-tight">{slices[hover].label}</span>
            </>
          ) : (
            <>
              <span className="text-xl font-bold text-gray-800 dark:text-white/90">{centerValue}</span>
              <span className="text-[11px] text-gray-500 dark:text-gray-400">{centerLabel}</span>
            </>
          )}
        </div>
      </div>
      <ul className="flex-1 w-full space-y-2.5 min-w-0">
        {slices.map((s, i) => (
          <li
            key={s.label}
            className={`flex items-center gap-2.5 text-[12.5px] rounded-lg px-2 py-1 -mx-2 transition-colors ${hover === i ? 'bg-gray-50 dark:bg-white/5' : ''}`}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-gray-600 dark:text-gray-300 truncate flex-1">{s.label}</span>
            <span className="font-semibold text-gray-800 dark:text-white/90 tabular-nums">{s.value}</span>
            <span className="text-gray-400 dark:text-gray-500 tabular-nums w-[42px] text-right">{Math.round((s.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

/* ------------------------------ Radial gauge ------------------------------- */

export const RadialGauge: React.FC<{
  pct: number;
  label: string;
  sub?: string;
  color?: string;
  size?: number;
}> = ({ pct, label, sub, color = '#0060F0', size = 200 }) => {
  const gid = useId();
  const clamped = Math.max(0, Math.min(100, pct));
  const cx = 100;
  const cy = 100;
  const r = 78;
  const startAngle = 135;
  const sweep = 270;
  const polar = (angleDeg: number, radius: number) => {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)] as const;
  };
  const arc = (from: number, to: number) => {
    const [x1, y1] = polar(from, r);
    const [x2, y2] = polar(to, r);
    const large = to - from > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  };
  const valueEnd = startAngle + (clamped / 100) * sweep;
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 200" width={size} height={size} role="img" aria-label={`${label}: ${Math.round(clamped)}%`}>
        <defs>
          <linearGradient id={`gauge-${gid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={color} />
            <stop offset="100%" stopColor="#12B76A" />
          </linearGradient>
        </defs>
        <path d={arc(startAngle, startAngle + sweep)} fill="none" strokeWidth="14" strokeLinecap="round" className="stroke-gray-100 dark:stroke-gray-800" />
        {clamped > 0 && (
          <path d={arc(startAngle, Math.max(valueEnd, startAngle + 0.1))} fill="none" stroke={`url(#gauge-${gid})`} strokeWidth="14" strokeLinecap="round" />
        )}
        <text x="100" y="98" textAnchor="middle" fontSize="30" fontWeight="700" fill="currentColor" className="text-gray-800 dark:text-white/90">
          {Math.round(clamped)}%
        </text>
        <text x="100" y="120" textAnchor="middle" fontSize="11.5" fill="currentColor" className="text-gray-400 dark:text-gray-500">
          of target
        </text>
      </svg>
      <div className="text-center -mt-2">
        <p className="text-[13px] font-semibold text-gray-700 dark:text-gray-200">{label}</p>
        {sub && <p className="text-[12px] text-gray-400 dark:text-gray-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
};
