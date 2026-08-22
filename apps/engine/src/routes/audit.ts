import type { FastifyInstance } from "fastify";
import type { EngineState } from "../state.js";
import { toJsonSafe } from "../serialize.js";

export async function auditRoutes(fastify: FastifyInstance, state: EngineState): Promise<void> {
  fastify.get("/api/audit", async (req) => {
    const { verify } = req.query as { verify?: string };
    return toJsonSafe(state.auditLog(verify === "true"));
  });
}
