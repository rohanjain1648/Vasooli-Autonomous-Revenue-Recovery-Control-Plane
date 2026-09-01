import { NextResponse } from "next/server";
import { toCaseDetail } from "@vasooli/engine";
import { getState } from "@/server/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const state = await getState();
  const record = state.getCase(id);
  if (!record) {
    return NextResponse.json({ error: "case not found" }, { status: 404 });
  }
  return NextResponse.json(toCaseDetail(record, state));
}
