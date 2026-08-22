"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type LedgerEntryView } from "@/lib/api";
import { useEngineEvents } from "@/lib/useEngineEvents";
import { formatDateTime } from "@/lib/format";

/** Re-hashes the chain in the browser, independent of the server's own
 * `?verify=true` check — the whole point of a tamper-evident log is that
 * a viewer doesn't have to trust the server's word for it. Mirrors
 * @vasooli/ledger's canonical-JSON + SHA-256 chaining exactly. */
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
    const { hash, prevHash: _p, ...rest } = entry;
    const canonical = JSON.stringify(sortKeysDeep(rest));
    const recomputed = await sha256Hex(prevHash + canonical);
    if (recomputed !== hash) return { valid: false, firstBrokenIndex: entry.index };
    prevHash = hash;
  }
  return { valid: true, firstBrokenIndex: null };
}

export default function AuditPage() {
  const [entries, setEntries] = useState<LedgerEntryView[]>([]);
  const [serverValid, setServerValid] = useState<boolean | undefined>(undefined);
  const [browserValid, setBrowserValid] = useState<boolean | undefined>(undefined);
  const [brokenIndex, setBrokenIndex] = useState<number | null>(null);

  const load = useCallback(() => {
    api.audit(true).then((data) => {
      setEntries(data.entries);
      setServerValid(data.valid);
      verifyChainInBrowser(data.entries).then((r) => {
        setBrowserValid(r.valid);
        setBrokenIndex(r.firstBrokenIndex);
      });
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEngineEvents((event) => {
    if (event.type === "case_transition" || event.type === "case_detected" || event.type === "approval_resolved") {
      load();
    }
  });

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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Audit Log</h1>
        <button onClick={exportLedger} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm">
          Export JSON
        </button>
      </div>

      {tampered ? (
        <div className="card border-2 border-[var(--color-danger)] bg-red-950/40 p-4 text-[var(--color-danger)]">
          ⚠ AUDIT LOG TAMPERED — hash chain broken at index {brokenIndex}. Every entry after this point is
          unverifiable.
        </div>
      ) : (
        <div className="card border border-emerald-800 bg-emerald-950/30 p-4 text-emerald-300">
          ✓ Hash chain verified in-browser (SHA-256, {entries.length} entries) — no tampering detected.
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Time</th>
              <th>Actor</th>
              <th>Case</th>
              <th>Action</th>
              <th>Hash</th>
            </tr>
          </thead>
          <tbody>
            {[...entries].reverse().map((e) => (
              <tr key={e.index}>
                <td>{e.index}</td>
                <td className="text-[var(--color-text-dim)]">{formatDateTime(e.timestamp)}</td>
                <td>{e.actor}</td>
                <td className="font-mono text-xs">{e.caseId.slice(0, 8)}</td>
                <td>{e.action}</td>
                <td className="font-mono text-xs text-[var(--color-text-dim)]">{e.hash.slice(0, 12)}…</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
