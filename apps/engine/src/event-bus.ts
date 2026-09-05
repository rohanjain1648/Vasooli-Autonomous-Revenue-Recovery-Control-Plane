import { EventEmitter } from "node:events";

/** Every kind of update the dashboard's SSE stream can push. Keeping this
 * a closed union (rather than `Record<string, unknown>`) means adding a
 * new event type is a compile error everywhere it needs handling. */
export type EngineEvent =
  | { type: "case_detected"; caseId: string; category: string; armGroup: string }
  | { type: "case_transition"; caseId: string; state: string; action: string; payload: unknown }
  | { type: "approval_pending"; caseId: string; reason: string }
  | { type: "approval_resolved"; caseId: string; decision: "approved" | "rejected" }
  | { type: "promise_recorded"; caseId: string; promiseId: string; channel: string }
  | { type: "promise_resolved"; caseId: string; promiseId: string; state: "honored" | "broken" }
  | { type: "promise_notice_sent"; caseId: string; promiseId: string }
  | { type: "circuit_breaker_tripped"; reason: string; trippedBy: "auto" | "manual" }
  | { type: "circuit_breaker_reset" }
  | { type: "metrics_update"; metrics: unknown };

/** Thin typed wrapper over Node's EventEmitter so SSE subscribers get a
 * single "event" channel without stringly-typed event names sprinkled
 * throughout the codebase. */
export class EngineEventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    // Many SSE clients can be connected at once (dashboard tabs); avoid the
    // default-11-listener warning without silently allowing an unbounded leak.
    this.emitter.setMaxListeners(100);
  }

  publish(event: EngineEvent): void {
    this.emitter.emit("event", event);
  }

  subscribe(handler: (event: EngineEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
