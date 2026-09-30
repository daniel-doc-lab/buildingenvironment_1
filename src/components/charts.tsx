"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/** Måler containerens bredde, så SVG'en tegnes i faktiske pixels (tekst skaleres ikke). */
function useWidth(initial: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(initial);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => e && setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}
import { cn } from "@/lib/utils";

const fmtKr = (ore: number, compact = true) => {
  const v = ore / 100;
  if (compact && Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toLocaleString("da-DK", { maximumFractionDigits: 1 })} mio.`;
  if (compact && Math.abs(v) >= 10_000) return `${Math.round(v / 1000).toLocaleString("da-DK")} t.`;
  return `${Math.round(v).toLocaleString("da-DK")} kr.`;
};

function niceMax(v: number) {
  if (v <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * pow;
}

/** Søjlediagram – én serie. Hover viser værdi. */
export function ColumnChart({
  data,
  height = 220,
  highlightLast = true,
  ariaLabel,
}: {
  data: { label: string; value: number; sub?: string }[];
  height?: number;
  highlightLast?: boolean;
  ariaLabel: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [box, w] = useWidth(640);
  const max = niceMax(Math.max(...data.map((d) => d.value), 1));
  const ticks = [0, 0.5, 1].map((t) => t * max);
  const padL = 56;
  const padB = 26;
  const h = height;
  const innerW = w - padL - 8;
  const innerH = h - padB - 10;
  const band = innerW / Math.max(1, data.length);
  const barW = Math.min(24, band * 0.56);
  return (
    <div className="relative" ref={box}>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label={ariaLabel} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => {
          const y = 10 + innerH - (t / max) * innerH;
          return (
            <g key={t}>
              <line x1={padL} x2={w - 8} y1={y} y2={y} stroke="var(--line)" strokeWidth={1} />
              <text x={padL - 8} y={y + 4} textAnchor="end" fontSize={11} fill="var(--muted)">
                {fmtKr(t)}
              </text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const bh = (d.value / max) * innerH;
          const x = padL + i * band + (band - barW) / 2;
          const y = 10 + innerH - bh;
          const active = hover === i || (hover === null && highlightLast && i === data.length - 1);
          const r = Math.min(4, bh / 2);
          return (
            <g key={d.label} onMouseEnter={() => setHover(i)}>
              <rect x={padL + i * band} y={10} width={band} height={innerH + padB} fill="transparent" />
              {bh > 0 ? (
                <path
                  d={`M${x},${y + bh} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${y + bh} Z`}
                  fill="var(--brand)"
                  opacity={active ? 1 : 0.45}
                />
              ) : null}
              <text x={padL + i * band + band / 2} y={h - 8} textAnchor="middle" fontSize={11} fill="var(--muted)">
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
      {hover !== null && data[hover] ? (
        <div
          className="pointer-events-none absolute -translate-x-1/2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs shadow-pop"
          style={{ left: `${((padL + hover * band + band / 2) / w) * 100}%`, top: 0 }}
        >
          <div className="font-medium text-ink">{data[hover].label}</div>
          <div className="tabular text-ink-2">{fmtKr(data[hover].value, false)}</div>
          {data[hover].sub ? <div className="text-muted">{data[hover].sub}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

/** Vandrette søjler i HTML – til top-lister (leverandører, konti, ejendomme). */
export function BarList({
  data,
  budget,
}: {
  data: { label: string; value: number; href?: string; budget?: number | null; sub?: string }[];
  budget?: boolean;
}) {
  const max = Math.max(...data.map((d) => Math.max(d.value, d.budget ?? 0)), 1);
  return (
    <ul className="space-y-2.5">
      {data.map((d) => {
        const over = d.budget != null && d.value > d.budget;
        const content = (
          <>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate text-ink">{d.label}</span>
              <span className="tabular shrink-0 text-ink-2">
                {fmtKr(d.value, false)}
                {budget && d.budget ? <span className="text-muted"> / {fmtKr(d.budget)}</span> : null}
              </span>
            </div>
            <div className="relative h-2 rounded-full bg-surface-2">
              <div
                className={cn("absolute inset-y-0 left-0 rounded-full", over ? "bg-danger" : "bg-brand")}
                style={{ width: `${(d.value / max) * 100}%` }}
                title={fmtKr(d.value, false)}
              />
              {budget && d.budget ? <div className="absolute inset-y-[-3px] w-0.5 rounded bg-ink/60" style={{ left: `${(d.budget / max) * 100}%` }} title="Budget" /> : null}
            </div>
            {d.sub ? <div className="mt-0.5 text-xs text-muted">{d.sub}</div> : null}
          </>
        );
        return (
          <li key={d.label}>
            {d.href ? (
              <a href={d.href} className="block rounded-lg p-1 -m-1 hover:bg-surface-2">
                {content}
              </a>
            ) : (
              content
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Saldo-kurve med crosshair og tooltip. */
export function BalanceChart({
  series,
  height = 260,
  events,
  ariaLabel,
}: {
  series: { date: string; balance: number; out: number; in: number }[];
  height?: number;
  events?: Record<string, string[]>;
  ariaLabel: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [box, w] = useWidth(720);
  const h = height;
  const padL = 64;
  const padB = 26;
  const padT = 12;
  const innerW = w - padL - 12;
  const innerH = h - padB - padT;
  const { min, max } = useMemo(() => {
    const vals = series.map((s) => s.balance);
    const lo = Math.min(...vals);
    const top = Math.max(...vals, 1);
    if (lo < 0) return { min: -niceMax(-lo), max: niceMax(top) };
    // Saldo-kurver: zoom ind på det relevante interval, så bevægelser er synlige
    const span = Math.max(top - lo, top * 0.05);
    const step = niceMax(span / 2) / 2 || 1;
    const min = Math.max(0, Math.floor((lo - span * 0.25) / step) * step);
    const max = Math.ceil((top + span * 0.15) / step) * step;
    return { min, max };
  }, [series]);
  const x = (i: number) => padL + (i / Math.max(1, series.length - 1)) * innerW;
  const y = (v: number) => padT + innerH - ((v - min) / (max - min)) * innerH;
  const path = series.map((s, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(s.balance).toFixed(1)}`).join(" ");
  const base = min < 0 ? 0 : min;
  const area = `${path} L${x(series.length - 1)},${y(base)} L${x(0)},${y(base)} Z`;
  const ticks = [min, (min + max) / 2, max];
  const low = series.reduce((m, s, i) => (s.balance < series[m]!.balance ? i : m), 0);
  const monthTicks = series
    .map((s, i) => ({ i, d: s.date }))
    .filter((t) => t.i === 0 || (t.d.endsWith("-01") && x(t.i) - x(0) > 56));

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * w;
    const i = Math.round(((px - padL) / innerW) * (series.length - 1));
    setHover(Math.max(0, Math.min(series.length - 1, i)));
  }
  const hs = hover !== null ? series[hover] : null;
  return (
    <div className="relative" ref={box}>
      <svg ref={ref} viewBox={`0 0 ${w} ${h}`} className="w-full touch-none" role="img" aria-label={ariaLabel} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={w - 12} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--line-strong)" : "var(--line)"} strokeWidth={1} />
            <text x={padL - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">
              {fmtKr(t)}
            </text>
          </g>
        ))}
        {monthTicks.map((t) => (
          <text key={t.i} x={x(t.i)} y={h - 8} textAnchor={t.i === 0 ? "start" : "middle"} fontSize={11} fill="var(--muted)">
            {new Date(t.d + "T12:00:00").toLocaleDateString("da-DK", t.i === 0 ? { day: "numeric", month: "short" } : { month: "short" })}
          </text>
        ))}
        <path d={area} fill="var(--brand)" opacity={0.1} />
        <path d={path} fill="none" stroke="var(--brand)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(low)} cy={y(series[low]!.balance)} r={4.5} fill={series[low]!.balance < 0 ? "var(--danger)" : "var(--brand)"} stroke="var(--surface)" strokeWidth={2} />
        <text x={Math.min(x(low), w - 120)} y={Math.min(y(series[low]!.balance) + 18, h - padB - 4)} fontSize={11} fill="var(--ink-2)">
          Laveste: {fmtKr(series[low]!.balance)}
        </text>
        {hs ? (
          <g>
            <line x1={x(hover!)} x2={x(hover!)} y1={padT} y2={padT + innerH} stroke="var(--line-strong)" strokeWidth={1} />
            <circle cx={x(hover!)} cy={y(hs.balance)} r={4} fill="var(--brand)" stroke="var(--surface)" strokeWidth={2} />
          </g>
        ) : null}
      </svg>
      {hs ? (
        <div
          className="pointer-events-none absolute top-2 z-10 w-56 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-pop"
          style={{ left: `${Math.min(70, Math.max(2, (x(hover!) / w) * 100 - 10))}%` }}
        >
          <div className="font-medium text-ink">{new Date(hs.date + "T12:00:00").toLocaleDateString("da-DK", { weekday: "short", day: "numeric", month: "long" })}</div>
          <div className="mt-1 flex justify-between">
            <span className="text-muted">Saldo</span>
            <span className="tabular font-medium text-ink">{fmtKr(hs.balance, false)}</span>
          </div>
          {hs.out ? (
            <div className="flex justify-between">
              <span className="text-muted">Ud</span>
              <span className="tabular text-ink-2">−{fmtKr(hs.out, false)}</span>
            </div>
          ) : null}
          {hs.in ? (
            <div className="flex justify-between">
              <span className="text-muted">Ind</span>
              <span className="tabular text-ink-2">+{fmtKr(hs.in, false)}</span>
            </div>
          ) : null}
          {events?.[hs.date]?.slice(0, 4).map((e) => (
            <div key={e} className="mt-0.5 truncate text-muted">
              · {e}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Lille sparkline til stat-kort. */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return null;
  const w = 100;
  const h = 28;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - 2 - ((v - min) / (max - min || 1)) * (h - 4)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cn("h-7 w-24", className)} aria-hidden>
      <polyline points={pts} fill="none" stroke="var(--muted)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={w} cy={h - 2 - ((values.at(-1)! - min) / (max - min || 1)) * (h - 4)} r={2.5} fill="var(--brand)" />
    </svg>
  );
}
