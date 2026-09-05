"use client";

import { useEffect, useRef } from "react";
import { ENGINE_URL } from "./api";

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

/** Subscribes to the engine's SSE stream for the lifetime of the component.
 * Reconnects automatically on drop (the browser's EventSource already
 * retries, but we also rebuild on unmount/remount to avoid stale
 * closures over `onEvent`). No polling anywhere in this dashboard. */
export function useEngineEvents(onEvent: (event: EngineEvent) => void): void {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    const source = new EventSource(`${ENGINE_URL}/api/events`);
    source.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as EngineEvent;
        handlerRef.current(event);
      } catch {
        // Comment/heartbeat lines have no `data:` payload and never reach
        // onmessage; a malformed payload is simply dropped.
      }
    };
    return () => source.close();
  }, []);
}
