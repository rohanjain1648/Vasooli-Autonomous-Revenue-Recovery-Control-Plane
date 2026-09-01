import { NextResponse } from "next/server";
import { computeMetricsSnapshot, toJsonSafe } from "@vasooli/engine";
import { getState } from "@/server/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(toJsonSafe(computeMetricsSnapshot(await getState())));
}
