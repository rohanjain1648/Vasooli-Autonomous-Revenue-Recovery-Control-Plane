import { NextResponse } from "next/server";
import { toJsonSafe } from "@vasooli/engine";
import { getState } from "@/server/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const state = await getState();
  return NextResponse.json(toJsonSafe(state.promisesSummary()));
}
