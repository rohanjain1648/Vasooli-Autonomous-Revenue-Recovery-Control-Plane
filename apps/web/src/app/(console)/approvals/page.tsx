"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { api, type CaseDetailView } from "@/lib/api";
import { useEngineEvents } from "@/lib/useEngineEvents";
import { formatPaise } from "@/lib/format";
import { CategoryBadge } from "@/components/Badges";
import { Empty, PageHead, PageIn } from "@/components/console/Shell";

export default function ApprovalsPage() {
  const [pending, setPending] = useState<CaseDetailView[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reachable, setReachable] = useState(true);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      setPending(await api.approvals());
      setReachable(true);
    } catch {
      setReachable(false);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEngineEvents((event) => {
    if (event.type === "approval_pending" || event.type === "approval_resolved") void load();
  });

  const act = async (id: string, decision: "approve" | "reject") => {
    setBusyId(id);
    // Remove optimistically: the card is gone the instant you decide, and
    // the stream confirms it a moment later.
    setPending((prev) => prev.filter((c) => c.id !== id));
    try {
      if (decision === "approve") await api.approve(id);
      else await api.reject(id);
    } catch {
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <PageIn>
      <PageHead
        title="Approvals"
        sub="Discounts, fee waivers and anything above the auto-approve threshold stop here. Nothing on this page has been sent."
        actions={
          pending.length > 0 ? (
            <span
              className="chip"
              style={{
                color: "var(--color-ink)",
                background: "var(--color-treatment)",
                borderColor: "var(--color-treatment)",
              }}
            >
              {pending.length} waiting
            </span>
          ) : undefined
        }
      />

      {!loaded ? null : pending.length === 0 ? (
        <Empty>
          {reachable ? (
            <>Nothing needs sign-off right now.</>
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
        <div className="grid gap-4 md:grid-cols-2">
          <AnimatePresence mode="popLayout">
            {pending.map((c) => (
              <motion.article
                key={c.id}
                layout
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.22 } }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="panel flex flex-col p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <CategoryBadge category={c.category} />
                      <Link
                        href={`/cases/${c.id}`}
                        className="figure truncate text-xs text-[var(--color-ink-dim)] underline-offset-4 hover:text-[var(--color-paper)] hover:underline"
                      >
                        {c.signal.entityId}
                      </Link>
                    </div>
                    <div className="figure mt-3 text-2xl" style={{ color: "var(--color-treatment)" }}>
                      {formatPaise(c.exposurePaise)}
                    </div>
                  </div>
                </div>

                {c.pendingArm && (
                  <div className="mt-4">
                    <div className="text-sm font-medium">{c.pendingArm.name}</div>
                    <p className="mt-1 text-sm leading-relaxed text-[var(--color-ink-dim)]">
                      {c.pendingArm.description}
                    </p>
                  </div>
                )}

                {c.diagnosis && (
                  <p className="mt-4 border-t border-[var(--color-ink-rule)] pt-3 text-[11px] leading-relaxed text-[var(--color-ink-dim)]">
                    <span className="label">Diagnosis</span>
                    <br />
                    {c.diagnosis.rootCause}
                  </p>
                )}

                <div className="mt-5 flex gap-2 pt-1">
                  <button
                    disabled={busyId === c.id}
                    onClick={() => act(c.id, "approve")}
                    data-cursor="Approve"
                    className="flex-1 rounded-full px-4 py-2.5 text-sm font-medium transition-opacity disabled:opacity-40"
                    style={{ background: "var(--color-treatment)", color: "var(--color-ink)" }}
                  >
                    Approve and send
                  </button>
                  <button
                    disabled={busyId === c.id}
                    onClick={() => act(c.id, "reject")}
                    className="rounded-full border border-[var(--color-ink-rule)] px-4 py-2.5 text-sm font-medium transition-colors hover:border-[var(--color-blocked)] hover:text-[var(--color-blocked)] disabled:opacity-40"
                  >
                    Reject
                  </button>
                </div>
              </motion.article>
            ))}
          </AnimatePresence>
        </div>
      )}
    </PageIn>
  );
}
