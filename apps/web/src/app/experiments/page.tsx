"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type ExperimentCohort, type CohortStatsView } from "@/lib/api";
import { useEngineEvents } from "@/lib/useEngineEvents";
import { formatPaise, formatPercent, formatCategory } from "@/lib/format";
import { CategoryBadge } from "@/components/Badges";
import { StatCard } from "@/components/StatCard";
import { UpliftGauge } from "@/components/UpliftGauge";

function CohortColumn({ label, stats }: { label: string; stats: CohortStatsView }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-[var(--color-text-dim)]">{label}</div>
      <div className="mt-1 text-xl font-semibold">{formatPercent(stats.successRate)}</div>
      <div className="text-xs text-[var(--color-text-dim)]">
        {stats.successes}/{stats.n} resolved ({stats.inFlight} in flight) · {formatPaise(stats.recoveredPaise)}
      </div>
    </div>
  );
}

export default function ExperimentsPage() {
  const [cohorts, setCohorts] = useState<ExperimentCohort[] | null>(null);

  const load = useCallback(() => {
    api.experiments().then(setCohorts).catch(console.error);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEngineEvents((event) => {
    if (event.type === "metrics_update") load();
  });

  if (!cohorts) return <div className="card h-64 animate-pulse" />;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Experiments — Treatment vs. Holdout</h1>

      {cohorts.length === 0 && (
        <div className="card p-8 text-center text-[var(--color-text-dim)]">
          No resolved cases yet.
        </div>
      )}

      <div className="space-y-4">
        {cohorts.map((c) => (
          <div key={c.category} className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CategoryBadge category={c.category} />
                <span className="font-medium">{formatCategory(c.category)}</span>
              </div>
              <StatCard label="Uplift p-value" value={c.uplift.pValue.toFixed(3)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <CohortColumn label="Treatment" stats={c.treatment} />
              <CohortColumn label="Holdout" stats={c.holdout} />
            </div>
            <div className="mt-4">
              <UpliftGauge diff={c.rateInterval.diff} lower={c.rateInterval.lower} upper={c.rateInterval.upper} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
