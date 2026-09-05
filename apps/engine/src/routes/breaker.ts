import type { FastifyInstance } from "fastify";
import type { EngineState } from "../state.js";

/** The global circuit breaker: read its status, or trip/reset it by hand.
 * The automatic trip (treatment significantly worse than holdout) runs
 * inside EngineState itself after every metrics change — these routes are
 * for the dashboard's manual STOP button and the read-only status banner. */
export async function breakerRoutes(fastify: FastifyInstance, state: EngineState): Promise<void> {
  fastify.get("/api/breaker", async () => state.circuitBreakerStatus());

  fastify.post("/api/breaker/trip", async () => {
    state.tripCircuitBreaker("manual", "Manually stopped from the dashboard");
    return state.circuitBreakerStatus();
  });

  fastify.post("/api/breaker/reset", async (_req, reply) => {
    const result = state.resetCircuitBreaker();
    if (!result.ok) {
      reply.code(409);
      return { error: "breaker is not tripped" };
    }
    return state.circuitBreakerStatus();
  });
}
