"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import { api, type LedgerEntryView } from "@/lib/api";
import { useEngineEvents } from "@/lib/useEngineEvents";
import { formatDateTime } from "@/lib/format";
import { Empty, PageHead, PageIn } from "@/components/console/Shell";

/**
 * Re-hashes the whole chain here in the browser with Web Crypto, mirroring
 * @vasooli/ledger's canonical-JSON + SHA-256 construction exactly. The API
 * also answers `?verify=true`, but a tamper-evident log that you can only
 * check by asking the server is not evidence of anything — so this page
 * does the walk itself and reports both results.
 */
async function verifyChainInBrowser(
  entries: LedgerEntryView[],
): Promise<{ valid: boolean; firstBrokenIndex: number | null }> {
  const GENESIS = "0".repeat(64);

  function sortKeysDeep(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sortKeysDeep);
    if (value !== null && typeof value === "object") {
      const input = value as Record<string, unknown>;
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(input).sort()) sorted[key] = sortKeysDeep(input[key]);
      return sorted;
    }
    return value;
  }

  async function sha256Hex(text: string): Promise<string> {
    const data = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  let prevHash = GENESIS;
  for (const entry of entries) {
    if (entry.prevHash !== prevHash) return { valid: false, firstBrokenIndex: entry.index };
    const { hash, prevHash: _ignored, ...rest } = entry;
    void _ignored;
    const recomputed = await sha256Hex(prevHash + JSON.stringify(sortKeysDeep(rest)));
    if (recomputed !== hash) return { valid: false, firstBrokenIndex: entry.index };
    prevHash = hash;
  }
  return { valid: true, firstBrokenIndex: null };
}

const ACTOR_TONE: Record<string, string> = {
  orchestrator: "var(--color-ink-dim)",
  llm: "var(--color-holdout)",
  bandit: "var(--color-holdout)",
  policy: "var(--color-treatment)",
  executor: "var(--color-treatment)",
  human: "var(--color-recovered)",
};

export default function AuditPage() {
  const [entries, setEntries] = useState<LedgerEntryView[]>([]);
  const [serverValid, setServerValid] = useState<boolean | undefined>();
  const [browserValid, setBrowserValid] = useState<boolean | undefined>();
  const [brokenIndex, setBrokenIndex] = useState<number | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [reachable, setReachable] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [tamperBusy, setTamperBusy] = useState(false);
  const [demoTamperedIndex, setDemoTamperedIndex] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.audit(true);
      setEntries(data.entries);
      setServerValid(data.valid);
      setReachable(true);
      setVerifying(true);
      const result = await verifyChainInBrowser(data.entries);
      setBrowserValid(result.valid);
      setBrokenIndex(result.firstBrokenIndex);
      setVerifying(false);
    } catch {
      setReachable(false);
      setVerifying(false);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEngineEvents((event) => {
    if (event.type !== "metrics_update") void load();
  });

  async function breakAnEntry() {
    setTamperBusy(true);
    try {
      const result = await api.tamperLedger();
      setDemoTamperedIndex(result.index);
      await load();
    } catch {
      // Nothing to tamper (empty ledger) or one is already tampered —
      // either way the button below reflects the current state on reload.
    } finally {
      setTamperBusy(false);
    }
  }

  async function restoreTheChain() {
    setTamperBusy(true);
    try {
      await api.restoreLedger();
      setDemoTamperedIndex(null);
      await load();
    } finally {
      setTamperBusy(false);
    }
  }

  function exportLedger() {
    const blob = new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vasooli-audit-ledger.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  const tampered = browserValid === false || serverValid === false;

  return (
    <PageIn>
      <PageHead
        title="Audit log"
        sub="Every decision the agent made, hash-chained. This page re-computes the chain in your browser rather than trusting the API's answer."
        actions={
          entries.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              {demoTamperedIndex !== null ? (
                <button
                  onClick={restoreTheChain}
                  disabled={tamperBusy}
                  className="rounded-full border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
                  style={{ borderColor: "var(--color-recovered)", color: "var(--color-recovered)" }}
                >
                  Restore chain
                </button>
              ) : (
                <button
                  onClick={breakAnEntry}
                  disabled={tamperBusy}
                  data-cursor="Break it"
                  className="rounded-full border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
                  style={{ borderColor: "var(--color-blocked)", color: "var(--color-blocked)" }}
                >
                  Break an entry
                </button>
              )}
              <button
                onClick={exportLedger}
                className="rounded-full border border-[var(--color-ink-rule)] px-4 py-2 text-sm transition-colors hover:border-[var(--color-paper)]"
              >
                Export JSON
              </button>
            </div>
          ) : undefined
        }
      />

      {loaded && !reachable ? (
        <Empty>
          The engine is not reachable, so there is no chain to verify. Start it with{" "}
          <code className="figure rounded bg-[var(--color-ink-raised)] px-1.5 py-0.5">
            pnpm dev:engine
          </code>
          .
        </Empty>
      ) : (
        <>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="panel mb-4 flex flex-wrap items-center justify-between gap-4 p-5"
            style={{
              borderColor: tampered
                ? "var(--color-blocked)"
                : browserValid
                  ? "var(--color-recovered)"
                  : undefined,
            }}
          >
            <div>
              <div
                className="text-base font-medium"
                style={{
                  color: tampered
                    ? "var(--color-blocked)"
                    : browserValid
                      ? "var(--color-recovered)"
                      : "var(--color-ink-dim)",
                }}
              >
                {tampered
                  ? `Chain broken at entry ${brokenIndex}`
                  : verifying
                    ? "Re-hashing the chain…"
                    : browserValid
                      ? "Chain verified in your browser"
                      : "Waiting for entries"}
              </div>
              <p className="mt-1 text-sm text-[var(--color-ink-dim)]">
                {tampered
                  ? "Everything after this entry is unverifiable. The stored hash does not match a re-computation of its contents."
                  : `SHA-256 over ${entries.length} entries, canonical JSON, walked from the genesis hash.`}
              </p>
            </div>
            <div className="flex gap-2">
              <VerifyPill label="Browser" ok={browserValid} pending={verifying} />
              <VerifyPill label="Server" ok={serverValid} pending={false} />
            </div>
          </motion.div>

          <div className="panel overflow-x-auto">
            <table className="ledger">
              <thead>
                <tr>
                  <th className="w-16">#</th>
                  <th>Time</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Case</th>
                  <th>Hash</th>
                </tr>
              </thead>
              <tbody>
                {[...entries].reverse().map((entry) => (
                  <tr
                    key={entry.index}
                    style={
                      entry.index === demoTamperedIndex
                        ? { background: "color-mix(in srgb, var(--color-blocked) 18%, transparent)" }
                        : undefined
                    }
                  >
                    <td className="figure text-xs text-[var(--color-ink-dim)]">{entry.index}</td>
                    <td className="figure text-xs text-[var(--color-ink-dim)]">
                      {formatDateTime(entry.timestamp)}
                    </td>
                    <td>
                      <span
                        className="label"
                        style={{ color: ACTOR_TONE[entry.actor] ?? "var(--color-ink-dim)" }}
                      >
                        {entry.actor}
                      </span>
                    </td>
                    <td className="text-sm">{entry.action}</td>
                    <td className="figure text-xs text-[var(--color-ink-dim)]">
                      {entry.caseId.slice(0, 8)}
                    </td>
                    <td className="figure text-xs text-[var(--color-ink-dim)]">
                      {entry.hash.slice(0, 16)}…
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </PageIn>
  );
}

function VerifyPill({ label, ok, pending }: { label: string; ok?: boolean; pending: boolean }) {
  const tone = pending
    ? "var(--color-ink-dim)"
    : ok
      ? "var(--color-recovered)"
      : ok === false
        ? "var(--color-blocked)"
        : "var(--color-ink-dim)";
  return (
    <span className="chip border" style={{ color: tone, borderColor: tone }}>
      {label} {pending ? "…" : ok ? "✓" : ok === false ? "✕" : "—"}
    </span>
  );
}
