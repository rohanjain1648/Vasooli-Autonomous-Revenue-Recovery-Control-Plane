import { NextResponse } from "next/server";
import { toJsonSafe } from "@vasooli/engine";
import { getState } from "@/server/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const state = await getState();
  const updated = state.reject(id);
  if (!updated) {
    return NextResponse.json({ error: "no pending approval for this case" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, case: toJsonSafe(updated.case) });
}
