import type { FastifyInstance } from "fastify";
import type { EngineState } from "../state.js";
import { toJsonSafe } from "../serialize.js";

/** Server-Sent Events stream: every case detection, state transition,
 * approval, and metrics update is pushed here as it happens — the
 * dashboard never polls (design spec §12). One handler serves every
 * page; clients that only care about one slice (e.g. `?stream=metrics`)
 * filter client-side, since SSE has no server-side topic routing without
 * extra protocol machinery this demo doesn't need. */
export async function eventsRoutes(fastify: FastifyInstance, state: EngineState): Promise<void> {
  fastify.get("/api/events", (req, reply) => {
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });
    res.write(": connected\n\n");

    const heartbeat = setInterval(() => {
      res.write(": heartbeat\n\n");
    }, 15_000);

    const unsubscribe = state.bus.subscribe((event) => {
      res.write(`data: ${JSON.stringify(toJsonSafe(event))}\n\n`);
    });

    req.raw.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
      res.end();
    });
  });
}
