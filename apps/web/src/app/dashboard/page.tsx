"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type MetricsSnapshot } from "@/lib/api";
import { useEngineEvents } from "@/lib/useEngineEvents";
import { formatPaise, formatPaiseCompact, formatPercent } from "@/lib/format";
import { StatCard } from "@/components/StatCard";
import { UpliftGauge } from "@/components/UpliftGauge";

function Skeleton() {
  return (
    <div className="space-y-6">
      <div className="card h-40 animate-pulse" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card h-24 animate-pulse" />
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<MetricsSnapshot | null>(null);
  const [connected, setConnected] = useState(false);

  const load = useCallback(() => {
    api.metrics().then(setMetrics).catch(console.error);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEngineEvents((event) => {
    setConnected(true);
    if (event.type === "metrics_update") {
      setMetrics(event.metrics as MetricsSnapshot);
    }
  });

  if (!metrics) return <Skeleton />;

  const significant = metrics.upliftRateLower > 0 || metrics.upliftRateUpper < 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Money Wall</h1>
        <span
          className={`pill ${connected ? "bg-emerald-900 text-emerald-300" : "bg-slate-700 text-slate-300"}`}
        >
          {connected ? "● live" : "○ connecting…"}
        </span>
      </div>

      <div className={`card border-2 p-6 ${significant ? "border-[var(--color-accent)]" : "border-[var(--color-border)]"}`}>
        <div className="text-xs uppercase tracking-wide text-[var(--color-text-dim)]">
          Incremental Recovery (Treatment vs. Holdout)
        </div>
        <div className="mt-1 text-4xl font-bold">{formatPaiseCompact(metrics.incrementalPaise)}</div>
        <div className="mt-1 text-sm text-[var(--color-text-dim)]">
          95% CI ±{formatPaiseCompact(metrics.ciWidthPaise)} · p={metrics.pValue.toFixed(3)}
          {significant ? " (significant)" : " (peeking-safe; keep collecting)"}
        </div>

        <div className="mt-6 grid grid-cols-3 gap-4">
          <StatCard label="Gross Recovered" value={formatPaise(metrics.grossPaise)} />
          <StatCard
            label="Treatment"
            value={formatPaise(metrics.treatment.recoveredPaise)}
            sub={`n=${metrics.treatment.n} · ${formatPercent(metrics.treatment.successRate)} recovered`}
          />
          <StatCard
            label="Holdout"
            value={formatPaise(metrics.holdout.recoveredPaise)}
            sub={`n=${metrics.holdout.n} · ${formatPercent(metrics.holdout.successRate)} recovered`}
          />
        </div>

        <div className="mt-6">
          <UpliftGauge
            diff={metrics.upliftRateDiff}
            lower={metrics.upliftRateLower}
            upper={metrics.upliftRateUpper}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Cases Detected" value={String(metrics.detected)} />
        <StatCard label="Cases Recovered" value={String(metrics.recovered)} />
        <StatCard label="Policy Blocked" value={String(metrics.blocked)} />
        <StatCard label="Deferred (Quiet Hours)" value={String(metrics.deferred)} />
      </div>
    </div>
  );
}
