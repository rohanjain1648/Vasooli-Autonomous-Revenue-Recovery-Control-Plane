import { NextResponse, type NextRequest } from "next/server";
import { toPromiseView } from "@vasooli/engine";
import { getState } from "@/server/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const state = await getState();

  const promises = state.listPromises({
    state: params.get("state") ?? undefined,
    caseId: params.get("caseId") ?? undefined,
  });

  return NextResponse.json(promises.map((p) => toPromiseView(p, state)));
}
