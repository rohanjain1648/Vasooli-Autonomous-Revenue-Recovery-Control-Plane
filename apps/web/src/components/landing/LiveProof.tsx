"use client";

import Link from "next/link";
import { GapMeter } from "@/components/GapMeter";
import { CountUp } from "@/components/ui/CountUp";
import { Reveal, RevealWords } from "@/components/ui/Reveal";
import { Magnetic } from "@/components/ui/Magnetic";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { useMetrics } from "@/lib/useEngineData";
import { formatPaise, formatPaiseCompact } from "@/lib/format";

/**
 * The claim, made with whatever numbers are actually available: the live
 * engine if one is running, otherwise the committed output of a seeded
 * batch. Which one is on screen is always stated.
 */
export function LiveProof() {
  const { metrics, source } = useMetrics();

  const incremental = Number(metrics.incrementalPaise);
  const ci = Number(metrics.ciWidthPaise);
  const significant = metrics.upliftRateLower > 0 || metrics.upliftRateUpper < 0;

  return (
    <section id="proof" className="bg-[var(--color-ink-deep)] text-[var(--color-paper)]">
      <div className="on-ink mx-auto max-w-[86rem] px-6 py-[15vh] md:px-10">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <Reveal>
              <div className="label mb-6 text-[var(--color-ink-dim)]">The number</div>
            </Reveal>
            <h2 className="display-tight max-w-[15ch] text-[9vw] md:text-[4.4vw]">
              <RevealWords text="This is the only figure we claim." />
            </h2>
          </div>
          <Reveal delay={0.1}>
            <SourceBadge source={source} />
          </Reveal>
        </div>

        <Reveal delay={0.12}>
          <div className="mt-14 flex flex-wrap items-baseline gap-x-6 gap-y-2 md:mt-20">
            <div
              className="display text-[19vw] leading-[0.82] md:text-[10vw]"
              style={{ color: "var(--color-treatment)" }}
            >
              <CountUp
                to={incremental}
                duration={2.2}
                live
                format={(v) => formatPaiseCompact(Math.round(v))}
              />
            </div>
            <div className="figure text-sm text-[var(--color-ink-dim)]">
              <div>
                95% CI ±<CountUp to={ci} duration={2.2} live format={(v) => formatPaiseCompact(Math.round(v))} />
              </div>
              <div className="mt-1">
                p = <CountUp to={metrics.pValue} duration={1.6} live format={(v) => v.toFixed(3)} />
              </div>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.16}>
          <p className="mt-6 max-w-[56ch] text-[1.0625rem] leading-relaxed text-[var(--color-ink-dim)]">
            Recovered because the agent acted, not recovered while it happened to be watching. The
            p-value is always-valid, so this page can be refreshed mid-pitch without invalidating the
            statistics.
          </p>
        </Reveal>

        <div className="mt-16 grid gap-14 md:mt-20 md:grid-cols-12">
          <Reveal delay={0.06} className="md:col-span-7">
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
          </Reveal>

          <Reveal delay={0.12} className="md:col-span-4 md:col-start-9">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-7">
              <Figure label="Gross recovered" value={formatPaise(metrics.grossPaise)} muted />
              <Figure label="Cases detected" value={String(metrics.detected)} />
              <Figure label="Cases recovered" value={String(metrics.recovered)} />
              <Figure
                label="Stopped by policy"
                value={String(metrics.blocked + metrics.deferred)}
              />
            </dl>

            <div className="mt-9">
              <Magnetic strength={0.3}>
                <Link
                  href="/dashboard"
                  data-cursor="Open"
                  className="group inline-flex items-center gap-3 rounded-full bg-[var(--color-treatment)] px-6 py-3.5 text-sm font-medium text-[var(--color-ink)] transition-transform"
                >
                  See it case by case
                  <span className="transition-transform duration-500 group-hover:translate-x-1">→</span>
                </Link>
              </Magnetic>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Figure({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div>
      <dt className="label text-[var(--color-ink-dim)]">{label}</dt>
      <dd
        className="figure mt-1.5 text-xl"
        style={{ color: muted ? "var(--color-ink-dim)" : "var(--color-paper)" }}
      >
        {value}
      </dd>
    </div>
  );
}
