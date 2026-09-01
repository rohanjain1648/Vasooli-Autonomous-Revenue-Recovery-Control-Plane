import type { FastifyInstance } from "fastify";
import type { EngineState } from "../state.js";
import { toJsonSafe } from "../serialize.js";
import { toApprovalView } from "../views.js";

export async function approvalsRoutes(fastify: FastifyInstance, state: EngineState): Promise<void> {
  fastify.get("/api/approvals", async () => state.listApprovals().map(toApprovalView));

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
