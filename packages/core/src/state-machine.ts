import type { CaseState } from "./types.js";

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: CaseState,
    public readonly to: CaseState,
  ) {
    super(`Invalid transition: ${from} -> ${to}`);
    this.name = "InvalidTransitionError";
  }
}

const TRANSITIONS: Record<CaseState, readonly CaseState[]> = {
  detected: ["diagnosing", "holdout", "stopped"],
  diagnosing: ["planned", "failed", "stopped"],
  planned: ["awaiting_approval", "executing", "stopped"],
  awaiting_approval: ["executing", "deferred", "stopped"],
  executing: ["recovered", "failed", "awaiting_approval", "stopped"],
  recovered: [],
  failed: [],
  stopped: [],
  holdout: ["recovered", "failed", "stopped"],
  deferred: ["awaiting_approval", "stopped"],
};

export function canTransition(from: CaseState, to: CaseState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function transition(from: CaseState, to: CaseState): CaseState {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
  return to;
}

export function isTerminal(state: CaseState): boolean {
  return TRANSITIONS[state].length === 0;
}
