"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type RecoveryCaseView } from "@/lib/api";
import { useEngineEvents } from "@/lib/useEngineEvents";
import { formatDateTime, formatPaise } from "@/lib/format";
import { StateBadge, CategoryBadge, ArmGroupBadge } from "@/components/Badges";

const STATES = [
  "detected",
  "diagnosing",
  "planned",
  "awaiting_approval",
  "executing",
  "recovered",
  "failed",
  "stopped",
  "holdout",
  "deferred",
];
const CATEGORIES = ["payment_failure", "checkout_abandonment", "subscription_failure", "b2b_receivable"];

type SortKey = "updatedAt" | "exposurePaise";

export default function CasesPage() {
  const [cases, setCases] = useState<RecoveryCaseView[]>([]);
  const [stateFilter, setStateFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");

  const load = useCallback(() => {
    api
      .cases({ state: stateFilter || undefined, category: categoryFilter || undefined, limit: 200 })
      .then(setCases)
      .catch(console.error);
  }, [stateFilter, categoryFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEngineEvents((event) => {
    if (event.type === "case_detected" || event.type === "case_transition") {
      load();
    }
  });

  const sorted = useMemo(() => {
    const copy = [...cases];
    if (sortKey === "exposurePaise") {
      copy.sort((a, b) => Number(b.exposurePaise) - Number(a.exposurePaise));
    } else {
      copy.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    }
    return copy;
  }, [cases, sortKey]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Cases</h1>
        <span className="text-sm text-[var(--color-text-dim)]">{cases.length} shown</span>
      </div>

      <div className="flex flex-wrap gap-3">
        <select
          className="card px-3 py-1.5 text-sm"
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value)}
        >
          <option value="">All states</option>
          {STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          className="card px-3 py-1.5 text-sm"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          className="card px-3 py-1.5 text-sm"
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
        >
          <option value="updatedAt">Sort: recently updated</option>
          <option value="exposurePaise">Sort: amount</option>
        </select>
      </div>

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Entity</th>
              <th>Category</th>
              <th>Amount</th>
              <th>State</th>
              <th>Arm Group</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link href={`/cases/${c.id}`} className="text-[var(--color-info)] hover:underline">
                    {c.entityId ?? c.id.slice(0, 8)}
                  </Link>
                </td>
                <td>
                  <CategoryBadge category={c.category} />
                </td>
                <td>{formatPaise(c.exposurePaise)}</td>
                <td>
                  <StateBadge state={c.state} />
                </td>
                <td>
                  <ArmGroupBadge armGroup={c.armGroup} />
                </td>
                <td className="text-[var(--color-text-dim)]">{formatDateTime(c.updatedAt)}</td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-[var(--color-text-dim)]">
                  No cases yet — the signal feed generates them continuously.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
