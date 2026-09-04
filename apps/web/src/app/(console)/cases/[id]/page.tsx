"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { api, type CaseDetailView, type LedgerEntryView, type PromiseView } from "@/lib/api";
import { useEngineEvents } from "@/lib/useEngineEvents";
import { formatDateTime, formatPaise } from "@/lib/format";
import {
  ArmGroupBadge,
  CategoryBadge,
  ChannelBadge,
  DecisionBadge,
  PromiseStateBadge,
  StateBadge,
} from "@/components/Badges";
import { Empty, PageIn, Skeleton } from "@/components/console/Shell";

const ACTOR_TONE: Record<string, string> = {
  orchestrator: "var(--color-ink-dim)",
  llm: "var(--color-holdout)",
  bandit: "var(--color-holdout)",
  policy: "var(--color-treatment)",
  executor: "var(--color-treatment)",
  human: "var(--color-recovered)",
};

type PolicyVerdict = { ruleId: string; decision: string; reason: string };

export default function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [record, setRecord] = useState<CaseDetailView | null>(null);
  const [promises, setPromises] = useState<PromiseView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [caseDetail, casePromises] = await Promise.all([
        api.case(id),
        api.promises({ caseId: id }),
      ]);
      setRecord(caseDetail);
      setPromises(casePromises);
      setError(null);
    } catch {
      setError("This case could not be loaded. The engine may not be running.");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEngineEvents((event) => {
    if ("caseId" in event && event.caseId === id) void load();
  });

  const act = async (decision: "approve" | "reject") => {
    setBusy(true);
    try {
      if (decision === "approve") await api.approve(id);
      else await api.reject(id);
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (error) return <Empty>{error}</Empty>;
  if (!record) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  const policyEntry = record.transitions.find((t) => t.action === "policy_evaluated");
  const verdicts = ((policyEntry?.payload as { allDecisions?: PolicyVerdict[] } | undefined)
    ?.allDecisions ?? []) as PolicyVerdict[];

  return (
    <PageIn>
      <Link
        href="/cases"
        className="label inline-flex items-center gap-2 text-[var(--color-ink-dim)] transition-colors hover:text-[var(--color-paper)]"
      >
        ← All cases
      </Link>

      {/* Header */}
      <div className="panel mt-4 p-6 md:p-7">
        <div className="flex flex-wrap items-center gap-2">
          <StateBadge state={record.state} />
          <CategoryBadge category={record.category} />
          <ArmGroupBadge armGroup={record.armGroup} />
          {record.needsApproval && (
            <span
              className="chip"
              style={{
                color: "var(--color-ink)",
                background: "var(--color-treatment)",
                borderColor: "var(--color-treatment)",
              }}
            >
              needs sign-off
            </span>
          )}
        </div>

        <h1 className="display-tight mt-4 text-3xl md:text-4xl">{record.signal.entityId}</h1>
        <div className="figure mt-1 text-xs text-[var(--color-ink-dim)]">case {record.id}</div>

        <dl className="mt-7 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
          <Field label="Exposure" value={formatPaise(record.exposurePaise)} />
          <Field
            label="Recovered"
            value={Number(record.recoveredPaise) > 0 ? formatPaise(record.recoveredPaise) : "—"}
            tone={Number(record.recoveredPaise) > 0 ? "var(--color-recovered)" : undefined}
          />
          <Field label="Selected arm" value={record.selectedArm ?? "—"} mono />
          <Field label="Gate verdict" value={<DecisionBadge decision={record.policyDecision} />} />
        </dl>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-5">
          {record.diagnosis && (
            <section className="panel p-5">
              <div className="mb-3 flex items-center justify-between">
                <span className="label text-[var(--color-ink-dim)]">Diagnosis</span>
                <span className="chip border border-[var(--color-ink-rule)] text-[var(--color-ink-dim)]">
                  proposal only
                </span>
              </div>
              <p className="text-sm leading-relaxed">{record.diagnosis.rootCause}</p>
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
                <MicroField label="Confidence" value={record.diagnosis.confidence.toFixed(2)} />
                <MicroField label="Evidence" value={record.diagnosis.evidenceCode} />
                <MicroField label="Segment" value={record.diagnosis.recommendedSegment} />
              </div>
              <p className="mt-4 border-t border-[var(--color-ink-rule)] pt-3 text-[11px] leading-relaxed text-[var(--color-ink-dim)]">
                The model produced this and nothing else. It did not choose the intervention and cannot
                move money.
              </p>
            </section>
          )}

          {verdicts.length > 0 && (
            <section className="panel p-5">
              <div className="mb-4 label text-[var(--color-ink-dim)]">Policy gate</div>
              <ul className="space-y-3">
                {verdicts.map((verdict, i) => (
                  <motion.li
                    key={verdict.ruleId}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.06 * i, duration: 0.4 }}
                    className="flex items-start gap-3"
                  >
                    <span className="mt-0.5">
                      <DecisionBadge decision={verdict.decision} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="figure block text-[11px] text-[var(--color-ink-dim)]">
                        {verdict.ruleId}
                      </span>
                      <span className="block text-xs leading-relaxed">{verdict.reason}</span>
                    </span>
                  </motion.li>
                ))}
              </ul>
              <p className="mt-4 border-t border-[var(--color-ink-rule)] pt-3 text-[11px] text-[var(--color-ink-dim)]">
                Most restrictive verdict governs. All of them are kept, including overridden ones.
              </p>
            </section>
          )}

          {record.needsApproval && record.pendingArm && (
            <section
              className="panel-raised p-5"
              style={{ borderColor: "var(--color-treatment)" }}
            >
              <div className="label mb-2" style={{ color: "var(--color-treatment)" }}>
                Waiting on you
              </div>
              <div className="text-base font-medium">{record.pendingArm.name}</div>
              <p className="mt-1 text-sm text-[var(--color-ink-dim)]">{record.pendingArm.description}</p>
              {record.pendingArm.template && (
                <pre className="mt-4 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-[var(--color-ink-deep)] p-3 text-[11px] leading-relaxed text-[var(--color-ink-dim)]">
                  {record.pendingArm.template}
                </pre>
              )}
              <div className="mt-5 flex gap-2">
                <button
                  disabled={busy}
                  onClick={() => act("approve")}
                  data-cursor="Approve"
                  className="rounded-full px-5 py-2.5 text-sm font-medium transition-opacity disabled:opacity-40"
                  style={{ background: "var(--color-treatment)", color: "var(--color-ink)" }}
                >
                  Approve and send
                </button>
                <button
                  disabled={busy}
                  onClick={() => act("reject")}
                  className="rounded-full border border-[var(--color-ink-rule)] px-5 py-2.5 text-sm font-medium transition-colors hover:border-[var(--color-blocked)] hover:text-[var(--color-blocked)] disabled:opacity-40"
                >
                  Reject
                </button>
              </div>
            </section>
          )}

          <PromiseSection caseId={id} promises={promises} onRecorded={load} />
        </div>

        <section className="panel lg:col-span-7">
          <div className="flex items-center justify-between border-b border-[var(--color-ink-rule)] px-5 py-3.5">
            <span className="label text-[var(--color-ink-dim)]">Timeline</span>
            <span className="figure text-[10px] text-[var(--color-ink-dim)]">
              {record.transitions.length} ledger entries
            </span>
          </div>
          <ol className="p-5">
            <AnimatePresence initial={false}>
              {record.transitions.map((entry, i) => (
                <TimelineRow
                  key={entry.hash}
                  entry={entry}
                  last={i === record.transitions.length - 1}
                  index={i}
                />
              ))}
            </AnimatePresence>
          </ol>
        </section>
      </div>
    </PageIn>
  );
}

function TimelineRow({
  entry,
  last,
  index,
}: {
  entry: LedgerEntryView;
  last: boolean;
  index: number;
}) {
  const [open, setOpen] = useState(false);
  const tone = ACTOR_TONE[entry.actor] ?? "var(--color-ink-dim)";

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.03, 0.4) }}
      className="relative flex gap-4 pb-5 last:pb-0"
    >
      {!last && (
        <span
          className="absolute left-[5px] top-4 h-full w-px"
          style={{ background: "var(--color-ink-rule)" }}
          aria-hidden
        />
      )}
      <span
        className="relative mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full border-2"
        style={{ borderColor: tone, background: "var(--color-ink-surface)" }}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex w-full flex-wrap items-baseline gap-x-3 gap-y-0.5 text-left"
          aria-expanded={open}
        >
          <span className="text-sm font-medium">{entry.action}</span>
          <span className="label" style={{ color: tone }}>
            {entry.actor}
          </span>
          <span className="figure text-[10px] text-[var(--color-ink-dim)]">
            {formatDateTime(entry.timestamp)}
          </span>
          <span className="figure ml-auto text-[10px] text-[var(--color-ink-dim)]">
            {entry.hash.slice(0, 10)}…
          </span>
        </button>

        <AnimatePresence initial={false}>
          {open && (
            <motion.pre
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="mt-2 overflow-hidden whitespace-pre-wrap rounded bg-[var(--color-ink-deep)] p-3 text-[11px] leading-relaxed text-[var(--color-ink-dim)]"
            >
              {JSON.stringify(entry.payload, null, 2)}
            </motion.pre>
          )}
        </AnimatePresence>
      </div>
    </motion.li>
  );
}

function PromiseSection({
  caseId,
  promises,
  onRecorded,
}: {
  caseId: string;
  promises: PromiseView[];
  onRecorded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [daysOut, setDaysOut] = useState(3);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const rupees = Number(amount);
    if (!rupees || rupees <= 0) return;
    setSubmitting(true);
    try {
      await api.recordPromise(caseId, {
        promisedAmountPaise: String(Math.round(rupees * 100)),
        promisedForMs: Date.now() + daysOut * 24 * 60 * 60 * 1000,
        channel: "manual",
        note: note || undefined,
      });
      setAmount("");
      setNote("");
      setOpen(false);
      onRecorded();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="panel p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="label text-[var(--color-ink-dim)]">Promise to pay</span>
        {!open && (
          <button
            onClick={() => setOpen(true)}
            className="chip border border-[var(--color-ink-rule)] transition-colors hover:border-[var(--color-treatment)] hover:text-[var(--color-treatment)]"
          >
            Log a promise
          </button>
        )}
      </div>

      {promises.length === 0 && !open && (
        <p className="text-sm text-[var(--color-ink-dim)]">
          Nothing captured yet. Recorded here whenever the customer commits to a date — by voice,
          IVR, or a human noting it down.
        </p>
      )}

      {promises.length > 0 && (
        <ul className="space-y-3">
          {promises.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="figure font-medium">{formatPaise(p.promisedAmountPaise)}</span>
              <span className="text-[var(--color-ink-dim)]">by {formatDateTime(p.promisedForMs)}</span>
              <ChannelBadge channel={p.channel} />
              <PromiseStateBadge state={p.state} />
              {p.note && <span className="w-full text-xs text-[var(--color-ink-dim)]">{p.note}</span>}
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="mt-4 space-y-3 border-t border-[var(--color-ink-rule)] pt-4">
          <div className="flex gap-3">
            <label className="flex-1">
              <span className="label mb-1 block text-[10px] text-[var(--color-ink-dim)]">
                Amount (₹)
              </span>
              <input
                type="number"
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="figure w-full rounded border border-[var(--color-ink-rule)] bg-[var(--color-ink-deep)] px-2.5 py-1.5 text-sm"
              />
            </label>
            <label className="w-28">
              <span className="label mb-1 block text-[10px] text-[var(--color-ink-dim)]">
                Days out
              </span>
              <input
                type="number"
                min={1}
                max={30}
                value={daysOut}
                onChange={(e) => setDaysOut(Number(e.target.value) || 1)}
                className="figure w-full rounded border border-[var(--color-ink-rule)] bg-[var(--color-ink-deep)] px-2.5 py-1.5 text-sm"
              />
            </label>
          </div>
          <label className="block">
            <span className="label mb-1 block text-[10px] text-[var(--color-ink-dim)]">
              Note (optional)
            </span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What the customer said"
              className="w-full rounded border border-[var(--color-ink-rule)] bg-[var(--color-ink-deep)] px-2.5 py-1.5 text-sm"
            />
          </label>
          <div className="flex gap-2">
            <button
              disabled={submitting || !amount}
              onClick={submit}
              className="rounded-full px-4 py-2 text-sm font-medium transition-opacity disabled:opacity-40"
              style={{ background: "var(--color-treatment)", color: "var(--color-ink)" }}
            >
              Save promise
            </button>
            <button
              onClick={() => setOpen(false)}
              className="rounded-full border border-[var(--color-ink-rule)] px-4 py-2 text-sm font-medium transition-colors hover:text-[var(--color-paper)]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function Field({
  label,
  value,
  tone,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  tone?: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="label text-[var(--color-ink-dim)]">{label}</dt>
      <dd
        className={`mt-1.5 truncate text-sm ${mono ? "figure text-xs" : "figure text-base"}`}
        style={tone ? { color: tone } : undefined}
        title={typeof value === "string" ? value : undefined}
      >
        {value}
      </dd>
    </div>
  );
}

function MicroField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="label text-[10px] text-[var(--color-ink-dim)]">{label}</div>
      <div className="figure mt-0.5 text-xs">{value}</div>
    </div>
  );
}
