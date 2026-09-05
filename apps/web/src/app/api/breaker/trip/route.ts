import { NextResponse } from "next/server";
import { getState } from "@/server/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const state = await getState();
  state.tripCircuitBreaker("manual", "Manually stopped from the dashboard");
  return NextResponse.json(state.circuitBreakerStatus());
}
