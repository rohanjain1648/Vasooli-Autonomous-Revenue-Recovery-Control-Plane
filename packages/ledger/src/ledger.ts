import { createHash } from "node:crypto";

export interface LedgerEntryInput {
  actor: string;
  caseId: string;
  action: string;
  payload: Record<string, unknown>;
}

export interface LedgerEntry extends LedgerEntryInput {
  index: number;
  timestamp: string;
  prevHash: string;
  hash: string;
}

const GENESIS_HASH = "0".repeat(64);

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === "object") {
    const input = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(input).sort()) {
      sorted[key] = sortKeysDeep(input[key]);
    }
    return sorted;
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function computeHash(
  prevHash: string,
  entry: LedgerEntryInput & { index: number; timestamp: string },
): string {
  return createHash("sha256")
    .update(prevHash)
    .update(canonicalJson(entry))
    .digest("hex");
}

/**
 * Append-only, hash-chained audit log. Every entry's hash depends on the
 * previous entry's hash plus the canonical JSON of its own fields, so
 * mutating any stored entry breaks every hash after it — `verify()`
 * detects this by recomputing the chain from the genesis hash.
 */
export class Ledger {
  private entries: LedgerEntry[] = [];
  private demoTamperBackup: { index: number; entry: LedgerEntry } | null = null;

  append(
    input: LedgerEntryInput,
    now: () => string = () => new Date().toISOString(),
  ): LedgerEntry {
    const index = this.entries.length;
    const prevHash = index === 0 ? GENESIS_HASH : this.entries[index - 1].hash;
    const timestamp = now();
    const hash = computeHash(prevHash, { ...input, index, timestamp });
    const entry: LedgerEntry = { ...input, index, timestamp, prevHash, hash };
    this.entries.push(entry);
    return entry;
  }

  all(): readonly LedgerEntry[] {
    return this.entries;
  }

  /** Recomputes the hash chain from stored entries and reports whether it is intact. */
  verify(): { valid: boolean; firstBrokenIndex: number | null } {
    let prevHash = GENESIS_HASH;
    for (const entry of this.entries) {
      const { hash, prevHash: storedPrevHash, ...rest } = entry;
      if (storedPrevHash !== prevHash) {
        return { valid: false, firstBrokenIndex: entry.index };
      }
      const recomputed = computeHash(prevHash, rest);
      if (recomputed !== hash) {
        return { valid: false, firstBrokenIndex: entry.index };
      }
      prevHash = hash;
    }
    return { valid: true, firstBrokenIndex: null };
  }

  /** Test-only helper to prove `verify()` catches tampering. Never called in production code paths. */
  _tamperForTest(index: number, patch: Partial<LedgerEntryInput>): void {
    this.entries[index] = { ...this.entries[index], ...patch };
  }

  /**
   * Demo-only mutation, reachable from the dashboard's audit page: corrupts
   * one stored entry's payload in place, breaking its hash and — because
   * every downstream hash chains through it — every entry after it. Keeps a
   * one-slot backup so `demoRestore()` can undo it exactly. Refuses a
   * second tamper while one is already pending, since the backup only
   * holds one entry: the point is proving the chain reacts, not building a
   * general-purpose corruption tool.
   */
  demoTamper(index: number): { ok: true } | { ok: false; reason: string } {
    if (index < 0 || index >= this.entries.length) {
      return { ok: false, reason: `index ${index} out of range (0-${this.entries.length - 1})` };
    }
    if (this.demoTamperBackup) {
      return { ok: false, reason: "an entry is already tampered — restore it first" };
    }
    const original = this.entries[index];
    this.demoTamperBackup = { index, entry: original };
    this.entries[index] = {
      ...original,
      payload: { ...original.payload, __demoTampered: true, __demoTamperedAt: Date.now() },
    };
    return { ok: true };
  }

  /** Undoes the one pending `demoTamper()`, if any. */
  demoRestore(): { ok: boolean } {
    if (!this.demoTamperBackup) return { ok: false };
    this.entries[this.demoTamperBackup.index] = this.demoTamperBackup.entry;
    this.demoTamperBackup = null;
    return { ok: true };
  }

  /** The index currently tampered, or null if the chain is clean. */
  demoTamperedIndex(): number | null {
    return this.demoTamperBackup?.index ?? null;
  }
}
