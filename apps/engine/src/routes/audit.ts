import type { FastifyInstance } from "fastify";
import type { EngineState } from "../state.js";
import { toJsonSafe } from "../serialize.js";

export async function auditRoutes(fastify: FastifyInstance, state: EngineState): Promise<void> {
  fastify.get("/api/audit", async (req) => {
    const { verify } = req.query as { verify?: string };
    return toJsonSafe(state.auditLog(verify === "true"));
  });

  // Demo-only: corrupts one entry so the audit page's browser-side
  // verifier can be watched catching it live. See Ledger.demoTamper.
  fastify.post("/api/audit/tamper", async (req, reply) => {
    const body = (req.body as { index?: number } | undefined) ?? {};
    const result = state.tamperLedgerForDemo(body.index);
    if (!result.ok) {
      reply.code(409);
      return { error: result.reason };
    }
    return result;
  });

  fastify.post("/api/audit/restore", async (_req, reply) => {
    const result = state.restoreLedgerForDemo();
    if (!result.ok) {
      reply.code(409);
      return { error: "nothing is tampered" };
    }
    return result;
  });
}
