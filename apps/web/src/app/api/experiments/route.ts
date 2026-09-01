import { NextResponse } from "next/server";
import { computeExperimentsSnapshot, toJsonSafe } from "@vasooli/engine";
import { getState } from "@/server/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(toJsonSafe(computeExperimentsSnapshot(await getState())));
}
