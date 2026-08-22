import type { FastifyInstance } from "fastify";
import type { EngineState } from "../state.js";
import { toJsonSafe } from "../serialize.js";

export async function approvalsRoutes(fastify: FastifyInstance, state: EngineState): Promise<void> {
  fastify.get("/api/approvals", async () => {
    return state.listApprovals().map((record) =>
      toJsonSafe({
        ...record.case,
        signal: record.signal,
        diagnosis: record.diagnosis,
        selectedArm: record.selectedArm,
        arm: record.pending?.arm,
      }),
    );
  });

  fastify.post("/api/approvals/:id/approve", async (req, reply) => {
    const { id } = req.params as { id: string };
    const updated = await state.approve(id);
    if (!updated) {
      reply.code(404);
      return { error: "no pending approval for this case" };
    }
    return { ok: true, case: toJsonSafe(updated.case) };
  });

  fastify.post("/api/approvals/:id/reject", async (req, reply) => {
    const { id } = req.params as { id: string };
    const updated = state.reject(id);
    if (!updated) {
      reply.code(404);
      return { error: "no pending approval for this case" };
    }
    return { ok: true, case: toJsonSafe(updated.case) };
  });
}
