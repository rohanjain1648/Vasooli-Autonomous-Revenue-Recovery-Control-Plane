import Fastify from "fastify";
import cors from "@fastify/cors";
import type { EngineState } from "./state.js";
import { metricsRoutes } from "./routes/metrics.js";
import { casesRoutes } from "./routes/cases.js";
import { approvalsRoutes } from "./routes/approvals.js";
import { auditRoutes } from "./routes/audit.js";
import { experimentsRoutes } from "./routes/experiments.js";
import { eventsRoutes } from "./routes/events.js";
import { promisesRoutes } from "./routes/promises.js";
import { breakerRoutes } from "./routes/breaker.js";

/** Builds (but does not start listening on) the Fastify app. Split out
 * from index.ts's bootstrap so tests can `fastify.inject()` against a
 * fully wired app without binding a real port. */
export async function buildServer(state: EngineState) {
  const fastify = Fastify({ logger: false });

  await fastify.register(cors, { origin: true });

  fastify.get("/health", async () => ({ ok: true }));

  await metricsRoutes(fastify, state);
  await casesRoutes(fastify, state);
  await approvalsRoutes(fastify, state);
  await auditRoutes(fastify, state);
  await experimentsRoutes(fastify, state);
  await eventsRoutes(fastify, state);
  await promisesRoutes(fastify, state);
  await breakerRoutes(fastify, state);

  return fastify;
}
