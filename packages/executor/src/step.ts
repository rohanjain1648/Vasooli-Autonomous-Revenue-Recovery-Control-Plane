export interface RetryPolicy {
  maxAttempts: number; // total attempts, including the first
  backoffMs: number; // base delay; doubles each retry (exponential)
}

export interface Step<TContext> {
  id: string;
  name: string;
  run: (context: TContext) => Promise<unknown>;
  retryPolicy?: RetryPolicy;
  /** Called in reverse order for every step that succeeded, if a later
   * step in the same execution fails permanently. */
  compensate?: (context: TContext) => Promise<void>;
}

export interface StepOutcome {
  stepId: string;
  /** "completed": succeeded and stayed committed. "failed": exhausted
   * retries, never succeeded. "compensated": had succeeded earlier in this
   * run but was rolled back because a later step failed permanently.
   * "compensation_failed": rollback itself threw. */
  status: "completed" | "failed" | "compensated" | "compensation_failed";
  attempts: number;
  result?: unknown;
  error?: string;
}

export class StepExecutionError extends Error {
  constructor(
    public readonly stepId: string,
    public readonly cause: unknown,
  ) {
    super(`Step '${stepId}' failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "StepExecutionError";
  }
}
