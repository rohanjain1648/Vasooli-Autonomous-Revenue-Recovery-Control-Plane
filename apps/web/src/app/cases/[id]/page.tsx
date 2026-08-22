"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type CaseDetailView } from "@/lib/api";
import { useEngineEvents } from "@/lib/useEngineEvents";
import { formatDateTime, formatPaise } from "@/lib/format";
import { StateBadge, CategoryBadge, ArmGroupBadge } from "@/components/Badges";

export default function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [record, setRecord] = useState<CaseDetailView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .case(id)
      .then(setRecord)
      .catch((e) => setError(String(e)));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEngineEvents((event) => {
    if ("caseId" in event && event.caseId === id) load();
  });

  async function handleApprove() {
    setBusy(true);
    try {
      await api.approve(id);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function handleReject() {
    setBusy(true);
    try {
      await api.reject(id);
      load();
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="text-[var(--color-danger)]">{error}</p>;
  if (!record) return <div className="card h-64 animate-pulse" />;

  return (
    <div className="space-y-6">
      <button
        onClick={() => router.push("/cases")}
        className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
      >
        ← Back to cases
      </button>

      <div className="card p-5">
        <div className="flex flex-wrap items-center gap-2">
          <StateBadge state={record.state} />
          <CategoryBadge category={record.category} />
          <ArmGroupBadge armGroup={record.armGroup} />
          {record.needsApproval && <span className="pill bg-amber-900 text-amber-300">Needs Approval</span>}
        </div>
        <h1 className="mt-3 text-lg font-semibold">{record.signal.entityId}</h1>
        <div className="mt-1 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <div className="text-[var(--color-text-dim)]">Exposure</div>
            <div>{formatPaise(record.exposurePaise)}</div>
          </div>
          <div>
            <div className="text-[var(--color-text-dim)]">Recovered</div>
            <div>{formatPaise(record.recoveredPaise)}</div>
          </div>
          <div>
            <div className="text-[var(--color-text-dim)]">Selected Arm</div>
            <div>{record.selectedArm ?? "—"}</div>
          </div>
          <div>
            <div className="text-[var(--color-text-dim)]">Policy Decision</div>
            <div>{record.policyDecision ?? "—"}</div>
          </div>
        </div>

        {record.diagnosis && (
          <div className="mt-4 rounded-lg border border-[var(--color-border)] p-3 text-sm">
            <div className="text-[var(--color-text-dim)]">LLM Diagnosis (read-only proposal)</div>
            <div className="mt-1">{record.diagnosis.rootCause}</div>
            <div className="mt-1 text-xs text-[var(--color-text-dim)]">
              confidence {record.diagnosis.confidence} · evidence: {record.diagnosis.evidenceCode} · segment:{" "}
              {record.diagnosis.recommendedSegment}
            </div>
          </div>
        )}

        {record.needsApproval && record.pendingArm && (
          <div className="mt-4 rounded-lg border border-amber-800 bg-amber-950/40 p-3">
            <div className="text-sm font-medium text-amber-300">
              Awaiting sign-off: {record.pendingArm.name}
            </div>
            <div className="mt-1 text-sm text-[var(--color-text-dim)]">{record.pendingArm.description}</div>
            <div className="mt-3 flex gap-2">
              <button
                disabled={busy}
                onClick={handleApprove}
                className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-black disabled:opacity-50"
              >
                Approve
              </button>
              <button
                disabled={busy}
                onClick={handleReject}
                className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="card p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-text-dim)]">
          Timeline
        </h2>
        <ol className="space-y-3 border-l border-[var(--color-border)] pl-4">
          {record.transitions.map((t, i) => (
            <li key={i} className="relative">
              <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-[var(--color-accent)]" />
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium">{t.action}</span>
                <span className="text-xs text-[var(--color-text-dim)]">{formatDateTime(t.timestamp)}</span>
                <span className="text-xs text-[var(--color-text-dim)]">by {t.actor}</span>
              </div>
              <pre className="mt-1 overflow-x-auto rounded bg-black/30 p-2 text-xs text-[var(--color-text-dim)]">
                {JSON.stringify(t.payload, null, 2)}
              </pre>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
