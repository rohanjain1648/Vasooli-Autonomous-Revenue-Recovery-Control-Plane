import { describe, it, expect, vi } from "vitest";
import { DurableExecutor } from "./executor.js";
import type { Step } from "./step.js";

interface TestContext {
  log: string[];
}

const noSleep = () => Promise.resolve();

describe("DurableExecutor", () => {
  it("runs all steps in order when everything succeeds", async () => {
    const executor = new DurableExecutor<TestContext>({ sleep: noSleep });
    const context: TestContext = { log: [] };
    const steps: Step<TestContext>[] = [
      { id: "a", name: "A", run: async (ctx) => { ctx.log.push("a"); } },
      { id: "b", name: "B", run: async (ctx) => { ctx.log.push("b"); } },
    ];

    const result = await executor.execute(steps, context);
    expect(result.status).toBe("completed");
    expect(context.log).toEqual(["a", "b"]);
    expect(result.outcomes.every((o) => o.status === "completed")).toBe(true);
  });

  it("retries a transiently-failing step and proceeds on eventual success", async () => {
    const executor = new DurableExecutor<TestContext>({ sleep: noSleep });
    const context: TestContext = { log: [] };
    let calls = 0;
    const steps: Step<TestContext>[] = [
      {
        id: "flaky",
        name: "Flaky",
        retryPolicy: { maxAttempts: 3, backoffMs: 1 },
        run: async () => {
          calls++;
          if (calls < 2) throw new Error("transient");
          return "ok";
        },
      },
    ];

    const result = await executor.execute(steps, context);
    expect(result.status).toBe("completed");
    expect(calls).toBe(2);
    expect(result.outcomes[0].attempts).toBe(2);
  });

  it("compensates completed steps in reverse order on permanent failure", async () => {
    const executor = new DurableExecutor<TestContext>({ sleep: noSleep });
    const context: TestContext = { log: [] };
    const steps: Step<TestContext>[] = [
      {
        id: "a",
        name: "A",
        run: async (ctx) => { ctx.log.push("a-run"); },
        compensate: async (ctx) => { ctx.log.push("a-undo"); },
      },
      {
        id: "b",
        name: "B",
        run: async (ctx) => { ctx.log.push("b-run"); },
        compensate: async (ctx) => { ctx.log.push("b-undo"); },
      },
      {
        id: "c",
        name: "C (always fails)",
        retryPolicy: { maxAttempts: 2, backoffMs: 1 },
        run: async () => { throw new Error("permanent"); },
      },
    ];

    const result = await executor.execute(steps, context);
    expect(result.status).toBe("failed");
    expect(context.log).toEqual(["a-run", "b-run", "b-undo", "a-undo"]);

    const cOutcome = result.outcomes.find((o) => o.stepId === "c");
    expect(cOutcome?.status).toBe("failed");
    expect(cOutcome?.attempts).toBe(2);

    const aOutcome = result.outcomes.find((o) => o.stepId === "a");
    const bOutcome = result.outcomes.find((o) => o.stepId === "b");
    expect(aOutcome?.status).toBe("compensated");
    expect(bOutcome?.status).toBe("compensated");
  });

  it("records compensation_failed when a rollback itself throws, but continues compensating others", async () => {
    const executor = new DurableExecutor<TestContext>({ sleep: noSleep });
    const context: TestContext = { log: [] };
    const steps: Step<TestContext>[] = [
      {
        id: "a",
        name: "A",
        run: async (ctx) => { ctx.log.push("a-run"); },
        compensate: async (ctx) => { ctx.log.push("a-undo"); },
      },
      {
        id: "b",
        name: "B (compensation fails)",
        run: async (ctx) => { ctx.log.push("b-run"); },
        compensate: async () => { throw new Error("rollback failed"); },
      },
      {
        id: "c",
        name: "C (always fails)",
        run: async () => { throw new Error("permanent"); },
      },
    ];

    const result = await executor.execute(steps, context);
    expect(result.status).toBe("failed");
    // b's compensation failed, but a's still ran.
    expect(context.log).toEqual(["a-run", "b-run", "a-undo"]);

    const bCompFailure = result.outcomes.find(
      (o) => o.stepId === "b" && o.status === "compensation_failed",
    );
    expect(bCompFailure).toBeDefined();
  });

  it("does not retry a step with no retryPolicy (default maxAttempts=1)", async () => {
    const executor = new DurableExecutor<TestContext>({ sleep: noSleep });
    let calls = 0;
    const steps: Step<TestContext>[] = [
      {
        id: "a",
        name: "A",
        run: async () => {
          calls++;
          throw new Error("fails once, no retry");
        },
      },
    ];

    const result = await executor.execute(steps, { log: [] });
    expect(result.status).toBe("failed");
    expect(calls).toBe(1);
  });

  it("uses exponential backoff between retries", async () => {
    const sleepSpy = vi.fn((_ms: number) => Promise.resolve());
    const executor = new DurableExecutor<TestContext>({ sleep: sleepSpy });
    let calls = 0;
    const steps: Step<TestContext>[] = [
      {
        id: "a",
        name: "A",
        retryPolicy: { maxAttempts: 4, backoffMs: 10 },
        run: async () => {
          calls++;
          if (calls < 4) throw new Error("retry me");
        },
      },
    ];

    await executor.execute(steps, { log: [] });
    expect(sleepSpy.mock.calls.map((c) => c[0])).toEqual([10, 20, 40]);
  });
});
