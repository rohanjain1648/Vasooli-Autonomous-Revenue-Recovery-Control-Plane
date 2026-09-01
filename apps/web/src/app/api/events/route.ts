import { toJsonSafe } from "@vasooli/engine";
import { getStateNow } from "@/server/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Serverless functions are killed at their time limit; the browser's
 *  EventSource reconnects on its own, so the stream simply resumes. */
export const maxDuration = 60;

export async function GET(request: Request) {
  const state = getStateNow();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      send(": connected\n\n");

      const unsubscribe = state.bus.subscribe((event) => {
        send(`data: ${JSON.stringify(toJsonSafe(event))}\n\n`);
      });

      const heartbeat = setInterval(() => send(": heartbeat\n\n"), 15_000);

      const shutdown = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Already torn down by the platform; nothing to do.
        }
      };

      request.signal.addEventListener("abort", shutdown);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
