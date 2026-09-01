"use client";

import { GapMeter } from "@/components/GapMeter";
import { CountUp } from "@/components/ui/CountUp";
import { ActivityFeed } from "@/components/console/ActivityFeed";
import { PageHead, PageIn, Stat } from "@/components/console/Shell";
import { useMetrics } from "@/lib/useEngineData";
import { formatPaise, formatPaiseCompact, formatPercent } from "@/lib/format";

export default function MoneyWallPage() {
  const { metrics } = useMetrics();

  const incremental = Number(metrics.incrementalPaise);
  const ci = Number(metrics.ciWidthPaise);
  const significant = metrics.upliftRateLower > 0 || metrics.upliftRateUpper < 0;

  return (
    <PageIn>
      <PageHead
        title="Money wall"
        sub="Gross recovery is the top line. Incremental is the only part of it the agent can claim, measured against the cases it was deliberately kept away from."
      />

      <div className="grid gap-4 lg:grid-cols-12">
        {/* The claim */}
        <section
          className="panel relative overflow-hidden p-6 md:p-8 lg:col-span-8"
          style={{ borderColor: significant ? "var(--color-recovered)" : undefined }}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <span className="label text-[var(--color-ink-dim)]">Incremental recovery</span>
            <span
              className="chip"
              style={{
                color: significant ? "var(--color-recovered)" : "var(--color-ink-dim)",
                borderColor: significant ? "var(--color-recovered)" : "var(--color-ink-rule)",
              }}
            >
              {significant ? "significant" : "still collecting"}
            </span>
          </div>

          <div className="mt-4 flex flex-wrap items-baseline gap-x-5 gap-y-1">
            <span
              className="display text-[16vw] leading-[0.85] md:text-[5.5rem]"
              style={{ color: "var(--color-treatment)" }}
            >
              <CountUp to={incremental} live duration={1.4} format={(v) => formatPaiseCompact(Math.round(v))} />
            </span>
            <span className="figure text-sm text-[var(--color-ink-dim)]">
              ±<CountUp to={ci} live duration={1.4} format={(v) => formatPaiseCompact(Math.round(v))} /> at 95%
              <span className="mx-2 opacity-40">·</span>
              p=<CountUp to={metrics.pValue} live duration={1.2} format={(v) => v.toFixed(3)} />
            </span>
          </div>

          <p className="mt-3 text-sm text-[var(--color-ink-dim)]">
            The p-value is always-valid, so watching this page live does not invalidate it.
          </p>

          <div className="mt-9">
            <GapMeter
              treatmentRate={metrics.treatment.successRate}
              holdoutRate={metrics.holdout.successRate}
              treatmentN={metrics.treatment.n}
              holdoutN={metrics.holdout.n}
              deltaLabel={formatPaiseCompact(incremental)}
              significant={significant}
              tone="ink"
              size="lg"
            />
          </div>

          <div className="mt-9 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-[var(--color-ink-rule)] pt-6 sm:grid-cols-3">
            <Inline
              label="Gross recovered"
              value={formatPaise(metrics.grossPaise)}
              note="everything that came back"
            />
            <Inline
              label="Treatment"
              value={formatPaise(metrics.treatment.recoveredPaise)}
              note={`${formatPercent(metrics.treatment.successRate)} of ${metrics.treatment.n} resolved`}
              tone="var(--color-treatment)"
            />
            <Inline
              label="Holdout"
              value={formatPaise(metrics.holdout.recoveredPaise)}
              note={`${formatPercent(metrics.holdout.successRate)} of ${metrics.holdout.n} resolved`}
              tone="var(--color-holdout)"
            />
          </div>
        </section>

        <div className="lg:col-span-4">
          <ActivityFeed />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Cases detected" value={<CountUp to={metrics.detected} live duration={0.9} />} />
        <Stat
          label="Recovered"
          value={<CountUp to={metrics.recovered} live duration={0.9} />}
          tone="var(--color-recovered)"
        />
        <Stat
          label="Blocked by policy"
          value={<CountUp to={metrics.blocked} live duration={0.9} />}
          tone={metrics.blocked > 0 ? "var(--color-blocked)" : undefined}
          sub="never reached the executor"
        />
        <Stat
          label="Deferred"
          value={<CountUp to={metrics.deferred} live duration={0.9} />}
          tone={metrics.deferred > 0 ? "var(--color-pending)" : undefined}
          sub="parked for quiet hours"
        />
      </div>
    </PageIn>
  );
}

function Inline({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone?: string;
}) {
  return (
    <div>
      <div className="label text-[var(--color-ink-dim)]">{label}</div>
      <div className="figure mt-1.5 text-lg" style={tone ? { color: tone } : undefined}>
        {value}
      </div>
      <div className="mt-0.5 text-[11px] text-[var(--color-ink-dim)]">{note}</div>
    </div>
  );
}
