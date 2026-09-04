import type { FastifyInstance } from "fastify";
import type { PromiseChannel } from "@vasooli/core";
import type { EngineState } from "../state.js";
import { toJsonSafe } from "../serialize.js";
import { toPromiseView } from "../views.js";

const VALID_CHANNELS: PromiseChannel[] = ["voice", "ivr", "email", "sms", "manual"];

export async function promisesRoutes(fastify: FastifyInstance, state: EngineState): Promise<void> {
  fastify.get("/api/promises", async (req) => {
    const { state: promiseState, caseId } = req.query as { state?: string; caseId?: string };
    return state.listPromises({ state: promiseState, caseId }).map((p) => toPromiseView(p, state));
  });

  fastify.get("/api/promises/summary", async () => toJsonSafe(state.promisesSummary()));

  fastify.post("/api/cases/:id/promise", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      promisedAmountPaise?: string | number;
      promisedForMs?: number;
      channel?: string;
      note?: string;
    };

    if (!body.promisedAmountPaise || !body.promisedForMs || !body.channel) {
      reply.code(400);
      return { error: "promisedAmountPaise, promisedForMs and channel are required" };
    }
    if (!VALID_CHANNELS.includes(body.channel as PromiseChannel)) {
      reply.code(400);
      return { error: `channel must be one of ${VALID_CHANNELS.join(", ")}` };
    }

    const promise = state.recordPromise({
      caseId: id,
      promisedAmountPaise: BigInt(body.promisedAmountPaise),
      promisedForMs: body.promisedForMs,
      channel: body.channel as PromiseChannel,
      note: body.note,
    });
    if (!promise) {
      reply.code(404);
      return { error: "case not found" };
    }
    return { ok: true, promise: toPromiseView(promise, state) };
  });
}
