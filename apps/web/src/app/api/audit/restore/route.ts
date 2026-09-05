import { NextResponse } from "next/server";
import { getState } from "@/server/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const state = await getState();
  const result = state.restoreLedgerForDemo();
  if (!result.ok) {
    return NextResponse.json({ error: "nothing is tampered" }, { status: 409 });
  }
  return NextResponse.json(result);
}
