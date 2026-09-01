"use client";

import { GapMeter } from "@/components/GapMeter";
import { CategoryBadge } from "@/components/Badges";
import { Empty, PageHead, PageIn } from "@/components/console/Shell";
import { useEngineResource } from "@/lib/useEngineData";
import { api, type ExperimentCohort } from "@/lib/api";
import { SEEDED_EXPERIMENTS } from "@/lib/snapshot";
import { formatCategory, formatPaise } from "@/lib/format";

export default function ExperimentsPage() {
  const { data: cohorts } = useEngineResource<ExperimentCohort[]>(
    () => api.experiments(),
    SEEDED_EXPERIMENTS,
    (type) => type === "metrics_update",
  );

  return (
    <PageIn>
      <PageHead
        title="Experiments"
        sub="One randomised comparison per leakage category. A negative gap is left on screen rather than hidden — an intervention that does not work is a finding, not a bug."
      />

      {cohorts.length === 0 ? (
        <Empty>No resolved cases yet.</Empty>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {cohorts.map((cohort) => {
            const significant = cohort.rateInterval.lower > 0 || cohort.rateInterval.upper < 0;
            const delta =
              Number(cohort.treatment.recoveredPaise) - Number(cohort.holdout.recoveredPaise);
            const negative = cohort.rateInterval.diff < 0;

            return (
              <section key={cohort.category} className="panel p-5 md:p-6">
                <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <CategoryBadge category={cohort.category} />
                    <h2 className="text-base font-medium">{formatCategory(cohort.category)}</h2>
                  </div>
                  <div className="figure text-xs text-[var(--color-ink-dim)]">
                    p = {cohort.uplift.pValue.toFixed(3)}
                    <span className="mx-2 opacity-40">·</span>
                    n = {cohort.uplift.n}
                  </div>
                </div>

                <GapMeter
                  treatmentRate={cohort.treatment.successRate}
                  holdoutRate={cohort.holdout.successRate}
                  treatmentN={cohort.treatment.n}
                  holdoutN={cohort.holdout.n}
                  deltaLabel={`${negative ? "−" : "+"}${formatPaise(Math.abs(delta))}`}
                  significant={significant}
                  tone="ink"
                />

                <div className="mt-6 grid grid-cols-3 gap-4 border-t border-[var(--color-ink-rule)] pt-4">
                  <Micro
                    label="Treatment"
                    value={formatPaise(cohort.treatment.recoveredPaise)}
                    note={`${cohort.treatment.successes}/${cohort.treatment.n} recovered`}
                    tone="var(--color-treatment)"
                  />
                  <Micro
                    label="Holdout"
                    value={formatPaise(cohort.holdout.recoveredPaise)}
                    note={`${cohort.holdout.successes}/${cohort.holdout.n} recovered`}
                    tone="var(--color-holdout)"
                  />
                  <Micro
                    label="95% CI on gap"
                    value={`${(cohort.rateInterval.lower * 100).toFixed(1)} to ${(
                      cohort.rateInterval.upper * 100
                    ).toFixed(1)} pts`}
                    note={significant ? "excludes zero" : "still includes zero"}
                  />
                </div>

                {cohort.treatment.inFlight + cohort.holdout.inFlight > 0 && (
                  <p className="mt-3 text-[11px] text-[var(--color-ink-dim)]">
                    {cohort.treatment.inFlight + cohort.holdout.inFlight} case(s) still in flight and not
                    yet counted.
                  </p>
                )}
              </section>
            );
          })}
        </div>
      )}
    </PageIn>
  );
}

function Micro({
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
    <div className="min-w-0">
      <div className="label text-[var(--color-ink-dim)]">{label}</div>
      <div className="figure mt-1 truncate text-sm" style={tone ? { color: tone } : undefined}>
        {value}
      </div>
      <div className="mt-0.5 text-[10px] text-[var(--color-ink-dim)]">{note}</div>
    </div>
  );
}
