"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { api, type RecoveryCaseView } from "@/lib/api";
import { useEngineEvents } from "@/lib/useEngineEvents";
import { formatDateTime, formatPaise } from "@/lib/format";
import { StateBadge, CategoryBadge, ArmGroupBadge } from "@/components/Badges";
import { Empty, PageHead, PageIn } from "@/components/console/Shell";

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

const CATEGORIES = [
  "payment_failure",
  "checkout_abandonment",
  "subscription_failure",
  "b2b_receivable",
];

type SortKey = "updatedAt" | "exposurePaise";

export default function CasesPage() {
  const [cases, setCases] = useState<RecoveryCaseView[]>([]);
  const [stateFilter, setStateFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");
  const [reachable, setReachable] = useState(true);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      setCases(
        await api.cases({
          state: stateFilter || undefined,
          category: categoryFilter || undefined,
          limit: 200,
        }),
      );
      setReachable(true);
    } catch {
      setReachable(false);
    } finally {
      setLoaded(true);
    }
  }, [stateFilter, categoryFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEngineEvents((event) => {
    if (event.type === "case_detected" || event.type === "case_transition") void load();
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
    <PageIn>
      <PageHead
        title="Cases"
        sub="Every at-risk case the detectors have raised, and where each one currently sits."
        actions={
          <span className="figure text-sm text-[var(--color-ink-dim)]">
            {sorted.length} shown
          </span>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-3">
        <FilterRow label="State" value={stateFilter} options={STATES} onChange={setStateFilter} />
        <FilterRow
          label="Category"
          value={categoryFilter}
          options={CATEGORIES}
          onChange={setCategoryFilter}
        />
        <div className="flex items-center gap-2">
          <span className="label text-[var(--color-ink-dim)]">Sort</span>
          <button
            onClick={() => setSortKey((k) => (k === "updatedAt" ? "exposurePaise" : "updatedAt"))}
            className="chip border border-[var(--color-ink-rule)] text-[var(--color-paper)] transition-colors hover:border-[var(--color-treatment)] hover:text-[var(--color-treatment)]"
          >
            {sortKey === "updatedAt" ? "Recent" : "Amount"}
          </button>
        </div>
      </div>

      {!loaded ? null : sorted.length === 0 ? (
        <Empty>
          {reachable ? (
            <>No cases match these filters.</>
          ) : (
            <>
              The engine is not reachable. Start it with{" "}
              <code className="figure rounded bg-[var(--color-ink-raised)] px-1.5 py-0.5">
                pnpm dev:engine
              </code>{" "}
              and cases will stream in here.
            </>
          )}
        </Empty>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="ledger">
            <thead>
              <tr>
                <th>Entity</th>
                <th>Category</th>
                <th className="text-right">Exposure</th>
                <th className="text-right">Recovered</th>
                <th>State</th>
                <th>Cohort</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {sorted.map((c, i) => (
                  <motion.tr
                    key={c.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.28, delay: Math.min(i * 0.012, 0.3) }}
                  >
                    <td>
                      <Link
                        href={`/cases/${c.id}`}
                        data-cursor="Open"
                        className="text-[var(--color-paper)] underline-offset-4 hover:text-[var(--color-treatment)] hover:underline"
                      >
                        {c.entityId ?? c.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td>
                      <CategoryBadge category={c.category} />
                    </td>
                    <td className="figure text-right">{formatPaise(c.exposurePaise)}</td>
                    <td
                      className="figure text-right"
                      style={{
                        color:
                          Number(c.recoveredPaise) > 0 ? "var(--color-recovered)" : "var(--color-ink-dim)",
                      }}
                    >
                      {Number(c.recoveredPaise) > 0 ? formatPaise(c.recoveredPaise) : "—"}
                    </td>
                    <td>
                      <StateBadge state={c.state} />
                    </td>
                    <td>
                      <ArmGroupBadge armGroup={c.armGroup} />
                    </td>
                    <td className="figure text-xs text-[var(--color-ink-dim)]">
                      {formatDateTime(c.updatedAt)}
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      )}
    </PageIn>
  );
}

function FilterRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (next: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="label mr-1 text-[var(--color-ink-dim)]">{label}</span>
      <Chip active={value === ""} onClick={() => onChange("")}>
        All
      </Chip>
      {options.map((option) => (
        <Chip key={option} active={value === option} onClick={() => onChange(option)}>
          {option.replace(/_/g, " ")}
        </Chip>
      ))}
    </div>
  );
}

function Chip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="chip border transition-colors"
      style={{
        color: active ? "var(--color-ink)" : "var(--color-ink-dim)",
        borderColor: active ? "var(--color-treatment)" : "var(--color-ink-rule)",
        background: active ? "var(--color-treatment)" : "transparent",
      }}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}
