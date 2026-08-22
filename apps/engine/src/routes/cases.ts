import type { FastifyInstance } from "fastify";
import type { EngineState, CaseRecord } from "../state.js";
import { toJsonSafe } from "../serialize.js";

function toCaseSummary(record: CaseRecord) {
  return toJsonSafe({
    ...record.case,
    signalCategory: record.signal.category,
    entityId: record.signal.entityId,
    diagnosis: record.diagnosis,
    selectedArm: record.selectedArm,
    policyDecision: record.policyDecision,
    needsApproval: record.pending !== undefined,
  });
}

function toCaseDetail(record: CaseRecord, state: EngineState) {
  return toJsonSafe({
    ...record.case,
    signal: record.signal,
    diagnosis: record.diagnosis,
    selectedArm: record.selectedArm,
    policyDecision: record.policyDecision,
    needsApproval: record.pending !== undefined,
    pendingArm: record.pending?.arm,
    transitions: state.caseTransitions(record.case.id),
  });
}

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
