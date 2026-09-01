"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEngineEvents } from "@/lib/useEngineEvents";

type Item = {
  key: string;
  caseId: string;
  action: string;
  detail: string;
  tone: string;
  at: number;
};

const ACTION_TONE: Record<string, string> = {
  detected: "var(--color-ink-dim)",
  diagnosed: "var(--color-holdout)",
  planned: "var(--color-holdout)",
  policy_evaluated: "var(--color-treatment)",
  executing: "var(--color-treatment)",
  execution_result: "var(--color-treatment)",
  approved: "var(--color-recovered)",
  rejected: "var(--color-blocked)",
  recovered: "var(--color-recovered)",
  failed: "var(--color-blocked)",
  stopped: "var(--color-blocked)",
  deferred: "var(--color-pending)",
};

/**
 * The engine's event stream, rendered as it arrives. This is the one
 * place in the console that proves the numbers are moving on their own
 * rather than being fetched once on load — so it stays visible on the
 * money wall rather than hiding behind a tab.
 */
export function ActivityFeed({ limit = 14 }: { limit?: number }) {
  const [items, setItems] = useState<Item[]>([]);
  const [count, setCount] = useState(0);

  useEngineEvents((event) => {
    if (event.type === "metrics_update") return;

    let action = "";
    let detail = "";

    if (event.type === "case_detected") {
      action = "detected";
      detail = `${event.category.replace(/_/g, " ")} · ${event.armGroup}`;
    } else if (event.type === "case_transition") {
      action = event.action;
      const payload = event.payload as Record<string, unknown> | null;
      detail =
        (payload?.finalDecision as string) ??
        (payload?.selectedArm as string) ??
        (payload?.status as string) ??
        (payload?.evidenceCode as string) ??
        "";
    } else if (event.type === "approval_pending") {
      action = "awaiting approval";
      detail = event.reason;
    } else if (event.type === "approval_resolved") {
      action = event.decision;
      detail = "by a person";
    }

    setCount((n) => n + 1);
    setItems((prev) =>
      [
        {
          key: `${event.caseId}-${action}-${performance.now()}`,
          caseId: event.caseId,
          action,
          detail,
          tone: ACTION_TONE[action] ?? "var(--color-ink-dim)",
          at: Date.now(),
        },
        ...prev,
      ].slice(0, limit),
    );
  });

  return (
    <div className="panel flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--color-ink-rule)] px-4 py-3">
        <span className="label text-[var(--color-ink-dim)]">Event stream</span>
        <span className="figure text-[10px] text-[var(--color-ink-dim)]">
          {count > 0 ? `${count} received` : "listening"}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {items.length === 0 ? (
          <div className="flex h-full min-h-[200px] items-center justify-center px-6 text-center text-xs leading-relaxed text-[var(--color-ink-dim)]">
            Nothing yet. Start the engine with{" "}
            <code className="figure mx-1 rounded bg-[var(--color-ink-raised)] px-1.5 py-0.5">
              pnpm dev:engine
            </code>{" "}
            and cases will appear here as they are detected.
          </div>
        ) : (
          <ul>
            <AnimatePresence initial={false}>
              {items.map((item) => (
                <motion.li
                  key={item.key}
                  layout
                  initial={{ opacity: 0, x: -12, height: 0 }}
                  animate={{ opacity: 1, x: 0, height: "auto" }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                  className="border-b border-[var(--color-ink-rule)] last:border-0"
                >
                  <Link
                    href={`/cases/${item.caseId}`}
                    className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--color-ink-raised)]"
                  >
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: item.tone }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs" style={{ color: item.tone }}>
                        {item.action}
                      </span>
                      {item.detail && (
                        <span className="block truncate text-[11px] text-[var(--color-ink-dim)]">
                          {item.detail}
                        </span>
                      )}
                    </span>
                    <span className="figure shrink-0 text-[10px] text-[var(--color-ink-dim)]">
                      {item.caseId.slice(0, 6)}
                    </span>
                  </Link>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </div>
  );
}
