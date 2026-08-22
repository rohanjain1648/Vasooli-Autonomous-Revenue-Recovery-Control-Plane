import type { Step, StepOutcome } from "./step.js";
import { StepExecutionError } from "./step.js";

export interface ExecutionResult {
  status: "completed" | "failed";
  outcomes: StepOutcome[];
  error?: string;
}

export interface DurableExecutorOptions {
  /** Injectable sleep so tests can run with zero real delay. Defaults to
   * a real setTimeout-based sleep. */
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Runs a linear sequence of steps against a shared context. Each step
 * retries with exponential backoff per its own policy; if a step
 * exhausts retries, every previously-completed step in this run is
 * compensated in reverse order before the failure propagates. This is
 * the durable step runner design spec §6.4 calls for: retries, timeouts
 * (via caller-supplied per-step timeouts inside `run`), and
 * compensations.
 */
export class DurableExecutor<TContext> {
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: DurableExecutorOptions = {}) {
    this.sleep = options.sleep ?? realSleep;
  }

  async execute(steps: Step<TContext>[], context: TContext): Promise<ExecutionResult> {
    const outcomes: StepOutcome[] = [];
    const completedSteps: Step<TContext>[] = [];

    for (const step of steps) {
      const policy = step.retryPolicy ?? { maxAttempts: 1, backoffMs: 0 };
      let lastError: unknown;
      let attempts = 0;
      let succeeded = false;
      let result: unknown;

      for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
        attempts = attempt;
        try {
          result = await step.run(context);
          succeeded = true;
          break;
        } catch (error) {
          lastError = error;
          if (attempt < policy.maxAttempts) {
            await this.sleep(policy.backoffMs * 2 ** (attempts - 1));
          }
        }
      }

      if (succeeded) {
        outcomes.push({ stepId: step.id, status: "completed", attempts, result });
        completedSteps.push(step);
        continue;
      }

      // Permanent failure: record it, then compensate everything that
      // completed earlier in this run, in reverse order.
      outcomes.push({
        stepId: step.id,
        status: "failed",
        attempts,
        error: lastError instanceof Error ? lastError.message : String(lastError),
      });

      for (const completed of [...completedSteps].reverse()) {
        if (!completed.compensate) continue;
        try {
          await completed.compensate(context);
          const completedOutcome = outcomes.find((o) => o.stepId === completed.id);
          if (completedOutcome) completedOutcome.status = "compensated";
        } catch (compError) {
          outcomes.push({
            stepId: completed.id,
            status: "compensation_failed",
            attempts: 1,
            error: compError instanceof Error ? compError.message : String(compError),
          });
        }
      }

      return {
        status: "failed",
        outcomes,
        error: new StepExecutionError(step.id, lastError).message,
      };
    }

    return { status: "completed", outcomes };
  }
}
