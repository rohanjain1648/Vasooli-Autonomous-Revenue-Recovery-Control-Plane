import { NextResponse, type NextRequest } from "next/server";
import { toCaseSummary } from "@vasooli/engine";
import { getState } from "@/server/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const limit = params.get("limit");
  const state = await getState();

  const records = state.listCases({
    state: params.get("state") ?? undefined,
    category: params.get("category") ?? undefined,
    limit: limit ? Number(limit) : undefined,
  });

  return NextResponse.json(records.map(toCaseSummary));
}
