// SPDX-License-Identifier: AGPL-3.0-or-later
// Plain-SVG line chart; no chart library.
const W = 300, H = 84, PAD = 4;

export default function Sparkline({ points, unit, color = "#5ee0c0", label }: { points: [string, number][]; unit: string; color?: string; label: string }) {
  if (points.length < 2) return <p className="text-xs text-muted">No data in the last 24 h.</p>;
  const t0 = Date.parse(points[0][0]), t1 = Date.parse(points.at(-1)![0]);
  const vs = points.map((p) => p[1]);
  const lo = Math.min(...vs), hi = Math.max(...vs), span = hi - lo || 1;
  const x = (t: string) => PAD + ((Date.parse(t) - t0) / (t1 - t0 || 1)) * (W - 2 * PAD);
  const y = (v: number) => H - PAD - ((v - lo) / span) * (H - 2 * PAD);
  const d = points.map(([t, v], i) => `${i ? "L" : "M"}${x(t).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const f = (n: number) => n.toFixed(n < 10 ? 1 : 0);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-20 w-full" role="img" aria-label={`${label}: 24 hour trend, ${f(lo)} to ${f(hi)} ${unit}`} preserveAspectRatio="none">
        <path d={d} fill="none" stroke={color} strokeWidth="1.8" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <div className="flex justify-between font-mono text-[10px] text-muted">
        <span>24 h ago</span><span>min {f(lo)} / max {f(hi)} {unit}</span><span>now</span>
      </div>
    </div>
  );
}
