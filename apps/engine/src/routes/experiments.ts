import type { FastifyInstance } from "fastify";
import { newcombeInterval, sequentialUpliftTest } from "@vasooli/stats";
import type { EngineState } from "../state.js";
import { toJsonSafe } from "../serialize.js";

export async function experimentsRoutes(fastify: FastifyInstance, state: EngineState): Promise<void> {
  fastify.get("/api/experiments", async () => {
    const cohorts = state.experimentsSnapshot();
    return toJsonSafe(
      cohorts.map(({ category, treatment, holdout }) => ({
        category,
        treatment,
        holdout,
        uplift: sequentialUpliftTest(treatment.successes, treatment.n, holdout.successes, holdout.n),
        rateInterval: newcombeInterval(treatment.successes, treatment.n, holdout.successes, holdout.n),
      })),
    );
  });
}
