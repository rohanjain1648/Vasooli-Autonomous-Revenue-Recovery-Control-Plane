import { NextResponse } from "next/server";
import { getState } from "@/server/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { index?: number } | null;
  const state = await getState();
  const result = state.tamperLedgerForDemo(body?.index);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 409 });
  }
  return NextResponse.json(result);
}
