"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { api, type PromiseView, type PromisesSummary } from "@/lib/api";
import { useEngineEvents } from "@/lib/useEngineEvents";
import { formatDateTime, formatPaise, formatPercent } from "@/lib/format";
import { CategoryBadge, PromiseStateBadge, ChannelBadge } from "@/components/Badges";
import { Empty, PageHead, PageIn, Stat } from "@/components/console/Shell";

const STATES = ["promised", "partial", "honored", "broken"];

export default function PromisesPage() {
  const [promises, setPromises] = useState<PromiseView[]>([]);
  const [summary, setSummary] = useState<PromisesSummary | null>(null);
  const [stateFilter, setStateFilter] = useState("");
  const [reachable, setReachable] = useState(true);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const [list, sum] = await Promise.all([
        api.promises({ state: stateFilter || undefined }),
        api.promisesSummary(),
      ]);
      setPromises(list);
      setSummary(sum);
      setReachable(true);
    } catch {
      setReachable(false);
    } finally {
      setLoaded(true);
    }
  }, [stateFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEngineEvents((event) => {
    if (event.type === "promise_recorded" || event.type === "promise_resolved") void load();
  });

  return (
    <PageIn>
      <PageHead
        title="Promise tracker"
        sub="A commitment captured during outreach — a voice call, an IVR reply, a human note. Honored means the money actually showed up; it is not a measure of how sincere the customer sounded."
        actions={
          summary ? (
            <span className="figure text-sm text-[var(--color-ink-dim)]">
              {promises.length} shown
            </span>
          ) : undefined
        }
      />

      {summary && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label="Total" value={summary.total} />
          <Stat label="Pending" value={summary.pending + summary.partial} tone="var(--color-treatment)" />
          <Stat label="Honored" value={summary.honored} tone="var(--color-recovered)" />
          <Stat label="Broken" value={summary.broken} tone="var(--color-blocked)" />
          <Stat
            label="Honor rate"
            value={formatPercent(summary.honorRate)}
            sub="of resolved promises"
          />
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-center gap-1.5">
        <span className="label mr-1 text-[var(--color-ink-dim)]">State</span>
        <Chip active={stateFilter === ""} onClick={() => setStateFilter("")}>
          All
        </Chip>
        {STATES.map((s) => (
          <Chip key={s} active={stateFilter === s} onClick={() => setStateFilter(s)}>
            {s}
          </Chip>
        ))}
      </div>

      {!loaded ? null : promises.length === 0 ? (
        <Empty>
          {reachable ? (
            <>No promises match these filters yet.</>
          ) : (
            <>
              The engine is not reachable. Start it with{" "}
              <code className="figure rounded bg-[var(--color-ink-raised)] px-1.5 py-0.5">
                pnpm dev:engine
              </code>
              .
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
                <th className="text-right">Promised</th>
                <th>Due</th>
                <th>Channel</th>
                <th>State</th>
                <th>Logged</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {promises.map((p, i) => (
                  <motion.tr
                    key={p.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.28, delay: Math.min(i * 0.012, 0.3) }}
                  >
                    <td>
                      <Link
                        href={`/cases/${p.caseId}`}
                        data-cursor="Open"
                        className="text-[var(--color-paper)] underline-offset-4 hover:text-[var(--color-treatment)] hover:underline"
                      >
                        {p.entityId ?? p.caseId.slice(0, 8)}
                      </Link>
                    </td>
                    <td>{p.category ? <CategoryBadge category={p.category} /> : "—"}</td>
                    <td className="figure text-right">{formatPaise(p.promisedAmountPaise)}</td>
                    <td className="figure text-xs text-[var(--color-ink-dim)]">
                      {formatDateTime(p.promisedForMs)}
                    </td>
                    <td>
                      <ChannelBadge channel={p.channel} />
                    </td>
                    <td>
                      <PromiseStateBadge state={p.state} />
                    </td>
                    <td className="figure text-xs text-[var(--color-ink-dim)]">
                      {formatDateTime(p.createdAt)}
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
