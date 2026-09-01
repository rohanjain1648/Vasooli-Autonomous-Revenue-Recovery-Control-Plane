import { NextResponse, type NextRequest } from "next/server";
import { toJsonSafe } from "@vasooli/engine";
import { getState } from "@/server/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const verify = request.nextUrl.searchParams.get("verify") === "true";
  const state = await getState();
  return NextResponse.json(toJsonSafe(state.auditLog(verify)));
}
