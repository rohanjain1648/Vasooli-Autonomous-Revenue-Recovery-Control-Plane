import { randomUUID, createHash } from "node:crypto";
import { transition } from "@vasooli/core";
import type { RecoveryCase, RiskSignal } from "@vasooli/core";
import { PolicyEngine } from "@vasooli/policy";
import type { PolicyContext } from "@vasooli/policy";
import type { LlmProvider, PlaybookArm } from "@vasooli/llm";
import type { RazorpayClient } from "@vasooli/razorpay";
import { DurableExecutor } from "@vasooli/executor";
import type { Step } from "@vasooli/executor";
import { Ledger } from "@vasooli/ledger";
import { selectArm, updateArm, createSeededRandom } from "@vasooli/stats";
import type { Arm } from "@vasooli/stats";
import { assignArm } from "./assignment.js";
import { simulatedOutcome, TREATMENT_SUCCESS_RATE, HOLDOUT_SUCCESS_RATE } from "./outcome.js";

export interface OrchestratorDeps {
  llmProvider: LlmProvider;
  razorpayClient: RazorpayClient;
  ledger: Ledger;
  policyEngine: PolicyEngine;
  playbookArms: (PlaybookArm & { id: string; costPaise?: bigint })[];
  banditArms: Arm[]; // shared posterior state across cases, mutated in place
  rngSeed?: number;
  holdoutPercent?: number;
  nowMs?: number;
}

export interface OrchestrationResult {
  case: RecoveryCase;
  diagnosis?: Awaited<ReturnType<LlmProvider["diagnose"]>>;
  selectedArm?: string;
  policyDecision?: string;
}

interface ExecContext {
  signal: RiskSignal;
  case: RecoveryCase;
  arm: PlaybookArm & { id: string; costPaise?: bigint };
  llmProvider: LlmProvider;
  razorpayClient: RazorpayClient;
  content?: string;
}

function nowIso(nowMs: number): string {
  return new Date(nowMs).toISOString();
}

/**
 * The full agent loop for one signal: diagnose (LLM, read-only) -> plan
 * (bandit arm selection, never the LLM) -> policy gate (deterministic) ->
 * execute (durable steps against the Razorpay client) -> ledger. Mirrors
 * design spec §2's non-negotiable path: signal -> diagnosis (proposal) ->
 * bandit -> POLICY GATE -> executor.
 */
export async function orchestrateCase(
  signal: RiskSignal,
  deps: OrchestratorDeps,
): Promise<OrchestrationResult> {
  const nowMs = deps.nowMs ?? Date.now();
  const holdoutPercent = deps.holdoutPercent ?? 20;
  const caseId = randomUUID();
  const armGroup = assignArm(caseId, holdoutPercent);

  let recoveryCase: RecoveryCase = {
    id: caseId,
    signalId: signal.id,
    category: signal.category,
    state: "detected",
    armGroup,
    exposurePaise: signal.exposurePaise,
    recoveredPaise: 0n,
    createdAt: nowIso(nowMs),
    updatedAt: nowIso(nowMs),
  };
  deps.ledger.append({
    actor: "orchestrator",
    caseId,
    action: "detected",
    payload: { signalId: signal.id, category: signal.category, armGroup },
  });

  if (armGroup === "holdout") {
    // No intervention — this is the counterfactual arm. It still resolves
    // to recovered/failed via the natural baseline rate so the measurement
    // engine has a comparison point.
    recoveryCase = { ...recoveryCase, state: transition("detected", "holdout") };
    const success = simulatedOutcome(caseId, HOLDOUT_SUCCESS_RATE);
    recoveryCase = {
      ...recoveryCase,
      state: transition("holdout", success ? "recovered" : "failed"),
      recoveredPaise: success ? recoveryCase.exposurePaise : 0n,
      updatedAt: nowIso(nowMs),
    };
    deps.ledger.append({
      actor: "orchestrator",
      caseId,
      action: recoveryCase.state,
      payload: { armGroup: "holdout", recoveredPaise: recoveryCase.recoveredPaise.toString() },
    });
    return { case: recoveryCase };
  }

  // Diagnose (LLM, read-only proposal)
  recoveryCase = { ...recoveryCase, state: transition("detected", "diagnosing") };
  const diagnosis = await deps.llmProvider.diagnose(signal);
  deps.ledger.append({
    actor: "llm",
    caseId,
    action: "diagnosed",
    payload: { ...diagnosis },
  });

  // Plan: bandit selects the arm, never the LLM. Seed derived from the
  // case id (+ a run-level seed) so a given case's arm draw is
  // reproducible without needing to thread RNG state between cases.
  const caseSeed = createHash("sha256")
    .update(`${deps.rngSeed ?? 1}:${caseId}`)
    .digest()
    .readUInt32BE(0);
  const rng = createSeededRandom(caseSeed);
  const selected = selectArm(deps.banditArms, rng);
  const arm = deps.playbookArms.find((a) => a.id === selected);
  if (!arm) throw new Error(`Selected bandit arm '${selected}' has no matching playbook arm`);

  recoveryCase = { ...recoveryCase, state: transition("diagnosing", "planned") };
  deps.ledger.append({
    actor: "bandit",
    caseId,
    action: "planned",
    payload: { selectedArm: selected },
  });

  // Policy gate — always routes through awaiting_approval as the checkpoint.
  recoveryCase = { ...recoveryCase, state: transition("planned", "awaiting_approval") };
  const policyContext: PolicyContext = {
    case: recoveryCase,
    nowMs,
    recentTouches: 0,
    estimatedRecoverablePaise: signal.exposurePaise,
    actionCostPaise: arm.costPaise ?? (arm.name === "control" ? 0n : 100n),
    isHighRiskAction: arm.requiresApproval,
  };
  const evaluation = deps.policyEngine.evaluate(policyContext);
  deps.ledger.append({
    actor: "policy",
    caseId,
    action: "policy_evaluated",
    payload: {
      finalDecision: evaluation.finalDecision,
      finalReason: evaluation.finalReason,
      allDecisions: evaluation.decisions,
    },
  });

  if (evaluation.finalDecision === "BLOCK") {
    recoveryCase = {
      ...recoveryCase,
      state: transition("awaiting_approval", "stopped"),
      updatedAt: nowIso(nowMs),
    };
    deps.ledger.append({ actor: "orchestrator", caseId, action: "stopped", payload: {} });
    return { case: recoveryCase, diagnosis, selectedArm: selected, policyDecision: "BLOCK" };
  }

  if (evaluation.finalDecision === "DEFER") {
    recoveryCase = {
      ...recoveryCase,
      state: transition("awaiting_approval", "deferred"),
      updatedAt: nowIso(nowMs),
    };
    deps.ledger.append({ actor: "orchestrator", caseId, action: "deferred", payload: {} });
    return { case: recoveryCase, diagnosis, selectedArm: selected, policyDecision: "DEFER" };
  }

  if (evaluation.finalDecision === "NEEDS_APPROVAL") {
    // Case sits in awaiting_approval; a human decides externally via
    // approveAndExecute() (approve) or stopViaRejection() (reject).
    return { case: recoveryCase, diagnosis, selectedArm: selected, policyDecision: "NEEDS_APPROVAL" };
  }

  // PASS: execute immediately.
  const finished = await executeAndFinish(recoveryCase, signal, arm, selected, deps, nowMs);
  return { case: finished, diagnosis, selectedArm: selected, policyDecision: "PASS" };
}

/**
 * The execution phase, shared by the automatic PASS path and the
 * human-approved resume path: awaiting_approval -> executing ->
 * recovered/failed, with durable steps and a bandit posterior update.
 */
async function executeAndFinish(
  awaitingCase: RecoveryCase,
  signal: RiskSignal,
  arm: PlaybookArm & { id: string; costPaise?: bigint },
  selected: string,
  deps: OrchestratorDeps,
  nowMs: number,
): Promise<RecoveryCase> {
  const caseId = awaitingCase.id;
  let recoveryCase: RecoveryCase = {
    ...awaitingCase,
    state: transition("awaiting_approval", "executing"),
  };
  deps.ledger.append({ actor: "orchestrator", caseId, action: "executing", payload: {} });

  const execContext: ExecContext = {
    signal,
    case: recoveryCase,
    arm,
    llmProvider: deps.llmProvider,
    razorpayClient: deps.razorpayClient,
  };

  const steps: Step<ExecContext>[] = [
    {
      id: "generate_content",
      name: "Generate outreach content",
      retryPolicy: { maxAttempts: 2, backoffMs: 50 },
      run: async (ctx) => {
        ctx.content = await ctx.llmProvider.generateContent(ctx.arm, {
          customer_name: ctx.signal.entityId,
          amount: (Number(ctx.signal.exposurePaise) / 100).toFixed(2),
          error_reason: String(ctx.signal.evidence.errorCode ?? "unknown"),
          retry_link: `https://pay.example/retry/${ctx.case.id}`,
          merchant_name: "Vasooli Demo Merchant",
        });
        return ctx.content;
      },
    },
    {
      id: "send_notification",
      name: "Send outreach notification",
      retryPolicy: { maxAttempts: 3, backoffMs: 100 },
      run: async (ctx) => {
        return ctx.razorpayClient.sendNotification(
          ctx.signal.entityId,
          "email",
          ctx.content ?? "",
        );
      },
    },
  ];

  const executor = new DurableExecutor<ExecContext>();
  const executionResult = await executor.execute(steps, execContext);
  deps.ledger.append({
    actor: "executor",
    caseId,
    action: "execution_result",
    payload: { status: executionResult.status, outcomes: executionResult.outcomes },
  });

  // Update bandit posterior based on the (simulated) outcome.
  const success = executionResult.status === "completed" && simulatedOutcome(caseId, TREATMENT_SUCCESS_RATE);
  const armIndex = deps.banditArms.findIndex((a) => a.id === selected);
  if (armIndex >= 0) {
    deps.banditArms[armIndex] = updateArm(deps.banditArms[armIndex], success);
  }

  recoveryCase = {
    ...recoveryCase,
    state: transition("executing", success ? "recovered" : "failed"),
    recoveredPaise: success ? recoveryCase.exposurePaise : 0n,
    updatedAt: nowIso(nowMs),
  };
  deps.ledger.append({
    actor: "orchestrator",
    caseId,
    action: recoveryCase.state,
    payload: { recoveredPaise: recoveryCase.recoveredPaise.toString() },
  });

  return recoveryCase;
}

/** Everything needed to resume a case that stopped at awaiting_approval
 * pending a human decision. Callers (e.g. the dashboard API) must persist
 * this alongside the case while it waits. */
export interface PendingApproval {
  case: RecoveryCase; // state must be "awaiting_approval"
  signal: RiskSignal;
  arm: PlaybookArm & { id: string; costPaise?: bigint };
  selectedArm: string;
}

/** A human approved a NEEDS_APPROVAL case: proceed to execution exactly as
 * the automatic PASS path would have. */
export async function approveAndExecute(
  pending: PendingApproval,
  deps: OrchestratorDeps,
): Promise<OrchestrationResult> {
  const nowMs = deps.nowMs ?? Date.now();
  deps.ledger.append({
    actor: "human",
    caseId: pending.case.id,
    action: "approved",
    payload: { selectedArm: pending.selectedArm },
  });
  const finished = await executeAndFinish(
    pending.case,
    pending.signal,
    pending.arm,
    pending.selectedArm,
    deps,
    nowMs,
  );
  return { case: finished, selectedArm: pending.selectedArm, policyDecision: "PASS" };
}

/** A human rejected a NEEDS_APPROVAL case: stop it, no execution. */
export function rejectApproval(pending: PendingApproval, deps: OrchestratorDeps): OrchestrationResult {
  const nowMs = deps.nowMs ?? Date.now();
  const stopped: RecoveryCase = {
    ...pending.case,
    state: transition("awaiting_approval", "stopped"),
    updatedAt: nowIso(nowMs),
  };
  deps.ledger.append({
    actor: "human",
    caseId: pending.case.id,
    action: "rejected",
    payload: { selectedArm: pending.selectedArm },
  });
  deps.ledger.append({ actor: "orchestrator", caseId: pending.case.id, action: "stopped", payload: {} });
  return { case: stopped, selectedArm: pending.selectedArm, policyDecision: "BLOCK" };
}
