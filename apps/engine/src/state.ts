import type { RecoveryCase, RiskSignal, LeakageCategory } from "@vasooli/core";
import type { DiagnosisOutput, LlmProvider } from "@vasooli/llm";
import type { RazorpayClient } from "@vasooli/razorpay";
import type { PolicyEngine } from "@vasooli/policy";
import type { Arm } from "@vasooli/stats";
import { Ledger } from "@vasooli/ledger";
import type { LedgerEntry } from "@vasooli/ledger";
import {
  orchestrateCase,
  approveAndExecute,
  rejectApproval,
} from "@vasooli/orchestrator";
import type { OrchestratorDeps, PendingApproval } from "@vasooli/orchestrator";
import type { PlaybookCatalog, CatalogArm } from "./playbooks.js";
import { EngineEventBus } from "./event-bus.js";
import { computeMetricsSnapshot } from "./metrics.js";

export interface CaseRecord {
  case: RecoveryCase;
  signal: RiskSignal;
  diagnosis?: DiagnosisOutput;
  selectedArm?: string;
  policyDecision?: string;
  policyReason?: string;
  /** Present only while the case sits at awaiting_approval + NEEDS_APPROVAL. */
  pending?: PendingApproval;
}

export interface EngineConfig {
  llmProvider: LlmProvider;
  razorpayClient: RazorpayClient;
  policyEngine: PolicyEngine;
  catalog: PlaybookCatalog;
  rngSeed?: number;
  holdoutPercent?: number;
  /** Passed straight through to OrchestratorDeps.caseIdFactory — set by
   * the seeded demo script for a fully reproducible batch. */
  caseIdFactory?: () => string;
}

/**
 * Everything the dashboard reads and writes lives here: the case store, the
 * shared hash-chained ledger, per-category bandit posteriors, and the SSE
 * event bus. A single instance is created at boot and threaded through
 * every route — there is no database in this demo (offline-first, design
 * spec §11), so a process restart resets the world, same as the simulator.
 */
export class EngineState {
  readonly ledger = new Ledger();
  readonly bus = new EngineEventBus();
  readonly cases = new Map<string, CaseRecord>();
  private readonly banditArms = new Map<LeakageCategory, Arm[]>();
  /** Contextual posteriors, keyed by `${category}:${evidenceCode}`. Each
   * bucket starts from the same flat prior as the category-level arms —
   * the bandit learns per root-cause once outcomes accumulate. */
  private readonly contextualBanditArms = new Map<string, Arm[]>();

  constructor(private readonly config: EngineConfig) {}

  private armsForCategory(category: LeakageCategory): Arm[] {
    let arms = this.banditArms.get(category);
    if (!arms) {
      const catalogArms = this.config.catalog.armsByCategory.get(category) ?? [];
      arms = catalogArms.map((a) => ({ id: a.id, alpha: 1, beta: 1 }));
      this.banditArms.set(category, arms);
    }
    return arms;
  }

  private contextualArms(category: LeakageCategory, evidenceCode: string): Arm[] {
    const key = `${category}:${evidenceCode}`;
    let arms = this.contextualBanditArms.get(key);
    if (!arms) {
      const catalogArms = this.config.catalog.armsByCategory.get(category) ?? [];
      arms = catalogArms.map((a) => ({ id: a.id, alpha: 1, beta: 1 }));
      this.contextualBanditArms.set(key, arms);
    }
    return arms;
  }

  private playbookArmsForCategory(category: LeakageCategory): CatalogArm[] {
    return this.config.catalog.armsByCategory.get(category) ?? [];
  }

  private deps(category: LeakageCategory, nowMs: number): OrchestratorDeps {
    return {
      llmProvider: this.config.llmProvider,
      razorpayClient: this.config.razorpayClient,
      ledger: this.ledger,
      policyEngine: this.config.policyEngine,
      playbookArms: this.playbookArmsForCategory(category),
      banditArms: this.armsForCategory(category),
      getBanditArms: (evidenceCode) => this.contextualArms(category, evidenceCode),
      rngSeed: this.config.rngSeed,
      holdoutPercent: this.config.holdoutPercent,
      caseIdFactory: this.config.caseIdFactory,
      nowMs,
    };
  }

  /** Feeds one detected risk signal through the full agent loop and
   * publishes every resulting ledger entry to SSE subscribers. */
  async ingestSignal(signal: RiskSignal, nowMs: number = Date.now()): Promise<CaseRecord> {
    const before = this.ledger.all().length;
    const deps = this.deps(signal.category, nowMs);
    const result = await orchestrateCase(signal, deps);

    const record: CaseRecord = {
      case: result.case,
      signal,
      diagnosis: result.diagnosis,
      selectedArm: result.selectedArm,
      policyDecision: result.policyDecision,
    };

    if (result.policyDecision === "NEEDS_APPROVAL" && result.selectedArm) {
      const arm = this.playbookArmsForCategory(signal.category).find(
        (a) => a.id === result.selectedArm,
      );
      if (arm) {
        record.pending = {
          case: result.case,
          signal,
          arm,
          selectedArm: result.selectedArm,
          evidenceCode: result.diagnosis?.evidenceCode,
        };
      }
    }

    this.cases.set(result.case.id, record);
    this.publishNewEntries(before);

    if (record.pending) {
      this.bus.publish({
        type: "approval_pending",
        caseId: result.case.id,
        reason: "Action requires human sign-off",
      });
    }
    this.bus.publish({ type: "metrics_update", metrics: computeMetricsSnapshot(this) });
    return record;
  }

  async approve(caseId: string): Promise<CaseRecord | null> {
    const record = this.cases.get(caseId);
    if (!record?.pending) return null;
    const before = this.ledger.all().length;
    const deps = this.deps(record.signal.category, Date.now());
    const result = await approveAndExecute(record.pending, deps);
    const updated: CaseRecord = { ...record, case: result.case, pending: undefined };
    this.cases.set(caseId, updated);
    this.publishNewEntries(before);
    this.bus.publish({ type: "approval_resolved", caseId, decision: "approved" });
    this.bus.publish({ type: "metrics_update", metrics: computeMetricsSnapshot(this) });
    return updated;
  }

  reject(caseId: string): CaseRecord | null {
    const record = this.cases.get(caseId);
    if (!record?.pending) return null;
    const before = this.ledger.all().length;
    const deps = this.deps(record.signal.category, Date.now());
    const result = rejectApproval(record.pending, deps);
    const updated: CaseRecord = { ...record, case: result.case, pending: undefined };
    this.cases.set(caseId, updated);
    this.publishNewEntries(before);
    this.bus.publish({ type: "approval_resolved", caseId, decision: "rejected" });
    this.bus.publish({ type: "metrics_update", metrics: computeMetricsSnapshot(this) });
    return updated;
  }

  private publishNewEntries(sinceIndex: number): void {
    const all = this.ledger.all();
    for (let i = sinceIndex; i < all.length; i++) {
      const entry = all[i];
      if (entry.action === "detected") {
        const payload = entry.payload as { category?: string; armGroup?: string };
        this.bus.publish({
          type: "case_detected",
          caseId: entry.caseId,
          category: String(payload.category ?? ""),
          armGroup: String(payload.armGroup ?? ""),
        });
      } else {
        const record = this.cases.get(entry.caseId);
        this.bus.publish({
          type: "case_transition",
          caseId: entry.caseId,
          state: record?.case.state ?? entry.action,
          action: entry.action,
          payload: entry.payload,
        });
      }
    }
  }

  listCases(filter: { state?: string; category?: string; limit?: number } = {}): CaseRecord[] {
    let all = [...this.cases.values()];
    if (filter.state) all = all.filter((r) => r.case.state === filter.state);
    if (filter.category) all = all.filter((r) => r.case.category === filter.category);
    all.sort((a, b) => (a.case.updatedAt < b.case.updatedAt ? 1 : -1));
    return filter.limit ? all.slice(0, filter.limit) : all;
  }

  getCase(id: string): CaseRecord | undefined {
    return this.cases.get(id);
  }

  caseTransitions(id: string): LedgerEntry[] {
    return this.ledger.all().filter((e) => e.caseId === id);
  }

  listApprovals(): CaseRecord[] {
    return [...this.cases.values()].filter((r) => r.pending !== undefined);
  }

  auditLog(verify: boolean): { entries: LedgerEntry[]; valid?: boolean; firstBrokenIndex?: number | null } {
    const entries = [...this.ledger.all()];
    if (!verify) return { entries };
    const result = this.ledger.verify();
    return { entries, valid: result.valid, firstBrokenIndex: result.firstBrokenIndex };
  }

  /** Cohort breakdown per category+arm-group for the experiments page. */
  experimentsSnapshot() {
    const byCategory = new Map<
      LeakageCategory,
      { treatment: CaseRecord[]; holdout: CaseRecord[] }
    >();
    for (const record of this.cases.values()) {
      const bucket = byCategory.get(record.case.category) ?? { treatment: [], holdout: [] };
      if (record.case.armGroup === "treatment") bucket.treatment.push(record);
      else bucket.holdout.push(record);
      byCategory.set(record.case.category, bucket);
    }

    return [...byCategory.entries()].map(([category, { treatment, holdout }]) => ({
      category,
      treatment: cohortStats(treatment),
      holdout: cohortStats(holdout),
    }));
  }

  metricsSnapshot() {
    const all = [...this.cases.values()];
    const treatment = all.filter((r) => r.case.armGroup === "treatment");
    const holdout = all.filter((r) => r.case.armGroup === "holdout");
    const tStats = cohortStats(treatment);
    const hStats = cohortStats(holdout);

    const detected = all.length;
    const recovered = all.filter((r) => r.case.state === "recovered").length;
    const blocked = all.filter((r) => r.case.state === "stopped").length;
    const deferred = all.filter((r) => r.case.state === "deferred").length;
    const grossPaise = all.reduce((sum, r) => sum + r.case.recoveredPaise, 0n);

    return {
      detected,
      recovered,
      blocked,
      deferred,
      grossPaise: grossPaise.toString(),
      treatment: tStats,
      holdout: hStats,
    };
  }
}

function cohortStats(records: CaseRecord[]) {
  const resolved = records.filter((r) => r.case.state === "recovered" || r.case.state === "failed");
  const successes = resolved.filter((r) => r.case.state === "recovered").length;
  const recoveredPaise = resolved.reduce((sum, r) => sum + r.case.recoveredPaise, 0n);
  return {
    n: resolved.length,
    inFlight: records.length - resolved.length,
    successes,
    successRate: resolved.length > 0 ? successes / resolved.length : 0,
    recoveredPaise: recoveredPaise.toString(),
  };
}
