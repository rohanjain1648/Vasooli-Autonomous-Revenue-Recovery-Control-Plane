import type { FastifyInstance } from "fastify";
import type { EngineState } from "../state.js";
import { computeMetricsSnapshot } from "../metrics.js";
import { toJsonSafe } from "../serialize.js";

export async function metricsRoutes(fastify: FastifyInstance, state: EngineState): Promise<void> {
  fastify.get("/api/metrics", async () => toJsonSafe(computeMetricsSnapshot(state)));
}
