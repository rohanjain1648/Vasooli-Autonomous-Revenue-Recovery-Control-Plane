"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, type CaseDetailView } from "@/lib/api";
import { useEngineEvents } from "@/lib/useEngineEvents";
import { formatPaise } from "@/lib/format";
import { CategoryBadge } from "@/components/Badges";

export default function ApprovalsPage() {
  const [pending, setPending] = useState<CaseDetailView[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    api.approvals().then(setPending).catch(console.error);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEngineEvents((event) => {
    if (event.type === "approval_pending" || event.type === "approval_resolved") load();
  });

  async function act(id: string, action: "approve" | "reject") {
    setBusyId(id);
    try {
      if (action === "approve") await api.approve(id);
      else await api.reject(id);
      setPending((p) => p.filter((c) => c.id !== id));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Approvals Inbox</h1>
        <span className="pill bg-amber-900 text-amber-300">{pending.length} pending</span>
      </div>

      {pending.length === 0 && (
        <div className="card p-8 text-center text-[var(--color-text-dim)]">
          Nothing needs sign-off right now.
        </div>
      )}

      <div className="space-y-3">
        {pending.map((c) => (
          <div key={c.id} className="card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <CategoryBadge category={c.category} />
                  <Link href={`/cases/${c.id}`} className="text-sm text-[var(--color-info)] hover:underline">
                    {c.signal.entityId}
                  </Link>
                </div>
                <div className="mt-1 text-lg font-semibold">{formatPaise(c.exposurePaise)}</div>
                {c.pendingArm && (
                  <>
                    <div className="mt-1 text-sm font-medium">{c.pendingArm.name}</div>
                    <div className="text-sm text-[var(--color-text-dim)]">{c.pendingArm.description}</div>
                  </>
                )}
                {c.diagnosis && (
                  <div className="mt-2 text-xs text-[var(--color-text-dim)]">
                    Diagnosis: {c.diagnosis.rootCause}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  disabled={busyId === c.id}
                  onClick={() => act(c.id, "approve")}
                  className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-black disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  disabled={busyId === c.id}
                  onClick={() => act(c.id, "reject")}
                  className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
