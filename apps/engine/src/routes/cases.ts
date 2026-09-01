import type { FastifyInstance } from "fastify";
import type { EngineState } from "../state.js";
import { toCaseDetail, toCaseSummary } from "../views.js";

export async function casesRoutes(fastify: FastifyInstance, state: EngineState): Promise<void> {
  fastify.get("/api/cases", async (req) => {
    const { state: caseState, category, limit } = req.query as {
      state?: string;
      category?: string;
      limit?: string;
    };
    const records = state.listCases({
      state: caseState,
      category,
      limit: limit ? Number(limit) : undefined,
    });
    return records.map(toCaseSummary);
  });

  fastify.get("/api/cases/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const record = state.getCase(id);
    if (!record) {
      reply.code(404);
      return { error: "case not found" };
    }
    return toCaseDetail(record, state);
  });
}
