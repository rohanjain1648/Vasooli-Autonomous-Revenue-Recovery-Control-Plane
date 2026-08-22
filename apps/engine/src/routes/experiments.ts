import type { FastifyInstance } from "fastify";
import type { EngineState } from "../state.js";
import { computeExperimentsSnapshot } from "../metrics.js";
import { toJsonSafe } from "../serialize.js";

export async function experimentsRoutes(fastify: FastifyInstance, state: EngineState): Promise<void> {
  fastify.get("/api/experiments", async () => toJsonSafe(computeExperimentsSnapshot(state)));
}
