import type { PromiseToPay } from "@vasooli/core";
import type { CaseRecord, EngineState } from "./state.js";
import { toJsonSafe } from "./serialize.js";

/**
 * The JSON shapes the dashboard consumes. Kept here rather than inside the
 * Fastify route files because two transports now serve them — the
 * standalone Fastify service and the Next.js route handlers — and a case
 * must look identical whichever one answered.
 */

export function toCaseSummary(record: CaseRecord) {
  return toJsonSafe({
    ...record.case,
    signalCategory: record.signal.category,
    entityId: record.signal.entityId,
    diagnosis: record.diagnosis,
    selectedArm: record.selectedArm,
    policyDecision: record.policyDecision,
    needsApproval: record.pending !== undefined,
  });
}

export function toCaseDetail(record: CaseRecord, state: EngineState) {
  return toJsonSafe({
    ...record.case,
    signal: record.signal,
    diagnosis: record.diagnosis,
    selectedArm: record.selectedArm,
    policyDecision: record.policyDecision,
    needsApproval: record.pending !== undefined,
    pendingArm: record.pending?.arm,
    transitions: state.caseTransitions(record.case.id),
  });
}

/** Enriches a promise with the category/entity of its case, so the
 * promises list doesn't need a second round-trip per row to be readable. */
export function toPromiseView(promise: PromiseToPay, state: EngineState) {
  const record = state.getCase(promise.caseId);
  return toJsonSafe({
    ...promise,
    category: record?.case.category,
    entityId: record?.signal.entityId,
    caseState: record?.case.state,
  });
}

export function toApprovalView(record: CaseRecord) {
  return toJsonSafe({
    ...record.case,
    signal: record.signal,
    diagnosis: record.diagnosis,
    selectedArm: record.selectedArm,
    arm: record.pending?.arm,
    pendingArm: record.pending?.arm,
  });
}
