import { NextResponse } from "next/server";
import { toPromiseView } from "@vasooli/engine";
import { getState } from "@/server/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Mirrors @vasooli/core's PromiseChannel — declared locally rather than
// importing @vasooli/core directly, since apps/web only depends on it
// transitively through @vasooli/engine.
const VALID_CHANNELS = ["voice", "ivr", "email", "sms", "manual"] as const;

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => null)) as {
    promisedAmountPaise?: string | number;
    promisedForMs?: number;
    channel?: string;
    note?: string;
  } | null;

  if (!body?.promisedAmountPaise || !body.promisedForMs || !body.channel) {
    return NextResponse.json(
      { error: "promisedAmountPaise, promisedForMs and channel are required" },
      { status: 400 },
    );
  }
  if (!(VALID_CHANNELS as readonly string[]).includes(body.channel)) {
    return NextResponse.json(
      { error: `channel must be one of ${VALID_CHANNELS.join(", ")}` },
      { status: 400 },
    );
  }

  const state = await getState();
  const promise = state.recordPromise({
    caseId: id,
    promisedAmountPaise: BigInt(body.promisedAmountPaise),
    promisedForMs: body.promisedForMs,
    channel: body.channel as (typeof VALID_CHANNELS)[number],
    note: body.note,
  });
  if (!promise) {
    return NextResponse.json({ error: "case not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, promise: toPromiseView(promise, state) });
}
