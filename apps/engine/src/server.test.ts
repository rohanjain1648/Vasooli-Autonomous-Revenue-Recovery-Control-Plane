import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "./server.js";
import { buildTestState, makeTestSignal, DAYTIME_MS } from "./test-helpers.js";

describe("engine HTTP API", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("GET /health responds ok", async () => {
    const state = buildTestState();
    app = await buildServer(state);
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it("GET /api/metrics reflects ingested cases", async () => {
    const state = buildTestState();
    await state.ingestSignal(makeTestSignal(), DAYTIME_MS);
    app = await buildServer(state);

    const res = await app.inject({ method: "GET", url: "/api/metrics" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.detected).toBe(1);
    expect(typeof body.incrementalPaise).toBe("string");
  });

  it("GET /api/cases filters by category and state", async () => {
    const state = buildTestState();
    await state.ingestSignal(makeTestSignal({ category: "payment_failure" }), DAYTIME_MS);
    await state.ingestSignal(makeTestSignal({ category: "b2b_receivable" }), DAYTIME_MS);
    app = await buildServer(state);

    const res = await app.inject({ method: "GET", url: "/api/cases?category=b2b_receivable" });
    const body = res.json();
    expect(body).toHaveLength(1);
    expect(body[0].category).toBe("b2b_receivable");
  });

  it("GET /api/cases/:id returns full detail with transitions, 404 when missing", async () => {
    const state = buildTestState();
    const record = await state.ingestSignal(makeTestSignal(), DAYTIME_MS);
    app = await buildServer(state);

    const ok = await app.inject({ method: "GET", url: `/api/cases/${record.case.id}` });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().transitions.length).toBeGreaterThan(0);

    const missing = await app.inject({ method: "GET", url: "/api/cases/does-not-exist" });
    expect(missing.statusCode).toBe(404);
  });

  it("GET /api/approvals lists pending cases; approve/reject resolve them", async () => {
    const state = buildTestState({ payment_failure: { requiresApproval: true } });
    const record = await state.ingestSignal(makeTestSignal(), DAYTIME_MS);
    app = await buildServer(state);

    const pending = await app.inject({ method: "GET", url: "/api/approvals" });
    expect(pending.json()).toHaveLength(1);

    const approve = await app.inject({
      method: "POST",
      url: `/api/approvals/${record.case.id}/approve`,
    });
    expect(approve.statusCode).toBe(200);
    expect(["recovered", "failed"]).toContain(approve.json().case.state);

    const afterApprove = await app.inject({ method: "GET", url: "/api/approvals" });
    expect(afterApprove.json()).toHaveLength(0);
  });

  it("POST /api/approvals/:id/reject stops the case", async () => {
    const state = buildTestState({ payment_failure: { requiresApproval: true } });
    const record = await state.ingestSignal(makeTestSignal(), DAYTIME_MS);
    app = await buildServer(state);

    const res = await app.inject({
      method: "POST",
      url: `/api/approvals/${record.case.id}/reject`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().case.state).toBe("stopped");
  });

  it("POST /api/approvals/:id/approve 404s for a case with no pending approval", async () => {
    const state = buildTestState();
    app = await buildServer(state);
    const res = await app.inject({ method: "POST", url: "/api/approvals/nope/approve" });
    expect(res.statusCode).toBe(404);
  });

  it("GET /api/audit?verify=true reports an intact chain", async () => {
    const state = buildTestState();
    await state.ingestSignal(makeTestSignal(), DAYTIME_MS);
    app = await buildServer(state);

    const res = await app.inject({ method: "GET", url: "/api/audit?verify=true" });
    const body = res.json();
    expect(body.valid).toBe(true);
    expect(body.entries.length).toBeGreaterThan(0);
  });

  it("GET /api/experiments returns per-category cohort comparisons", async () => {
    const state = buildTestState();
    await state.ingestSignal(makeTestSignal(), DAYTIME_MS);
    app = await buildServer(state);

    const res = await app.inject({ method: "GET", url: "/api/experiments" });
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body[0]).toHaveProperty("uplift");
    expect(body[0]).toHaveProperty("rateInterval");
  });
});
