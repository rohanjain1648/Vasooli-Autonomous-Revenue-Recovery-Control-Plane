import { formatPercent } from "@/lib/format";

/** A simple horizontal gauge: the treatment-vs-holdout recovery-rate gap,
 * with its 95% CI band drawn around the point estimate. No charting
 * library needed for one number. */
export function UpliftGauge({
  diff,
  lower,
  upper,
}: {
  diff: number;
  lower: number;
  upper: number;
}) {
  // Map [-1, 1] rate-diff space onto a 0-100% track.
  const toPct = (v: number) => ((Math.max(-1, Math.min(1, v)) + 1) / 2) * 100;
  const center = toPct(diff);
  const left = toPct(lower);
  const right = toPct(upper);
  const significant = lower > 0 || upper < 0;

  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-[var(--color-text-dim)]">
        <span>-100%</span>
        <span>0%</span>
        <span>+100%</span>
      </div>
      <div className="relative h-3 rounded-full bg-[var(--color-border)]">
        <div className="absolute top-1/2 h-px w-full -translate-y-1/2 bg-[var(--color-text-dim)]" style={{ left: 0 }} />
        <div
          className={`absolute top-0 h-3 rounded-full ${significant ? "bg-emerald-700/50" : "bg-slate-500/40"}`}
          style={{ left: `${left}%`, width: `${Math.max(0.5, right - left)}%` }}
        />
        <div
          className={`absolute top-1/2 h-4 w-1 -translate-y-1/2 rounded-full ${significant ? "bg-[var(--color-accent)]" : "bg-slate-300"}`}
          style={{ left: `${center}%` }}
        />
      </div>
      <div className="mt-2 text-xs text-[var(--color-text-dim)]">
        Recovery-rate gap: {formatPercent(diff)} (95% CI {formatPercent(lower)} to {formatPercent(upper)})
        {significant ? " — statistically significant" : " — not yet significant"}
      </div>
    </div>
  );
}
