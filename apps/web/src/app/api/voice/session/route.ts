import { NextResponse } from "next/server";
import { getState } from "@/server/engine";
import { buildVoiceInstructions, RECORD_PROMISE_TOOL } from "@/server/voice-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Mints a short-lived ephemeral client secret for one live voice call,
 * scoped to one case. The browser uses this secret — never the real
 * OPENAI_API_KEY, which never leaves this server — to open a WebRTC
 * session directly against OpenAI's Realtime API.
 *
 * Same offline-first posture as every other provider in this repo (see
 * docs/adr/0005): with no OPENAI_API_KEY set, this returns
 * `{available: false}` rather than an error, so the console can show a
 * clear disabled state instead of a broken button.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { caseId?: string } | null;
  if (!body?.caseId) {
    return NextResponse.json({ error: "caseId is required" }, { status: 400 });
  }

  const state = await getState();
  const record = state.getCase(body.caseId);
  if (!record) {
    return NextResponse.json({ error: "case not found" }, { status: 404 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      available: false,
      reason:
        "Live voice needs OPENAI_API_KEY set in the environment. Without it, log a promise manually instead.",
    });
  }

  const instructions = buildVoiceInstructions({
    entityId: record.signal.entityId,
    category: record.case.category,
    exposurePaise: record.case.exposurePaise,
    errorReason: record.diagnosis?.rootCause,
  });

  const upstream = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      // Short-lived on purpose — this secret is handed to the browser.
      expires_after: { anchor: "created_at", seconds: 300 },
      session: {
        type: "realtime",
        model: "gpt-realtime",
        instructions,
        tools: [RECORD_PROMISE_TOOL],
        audio: {
          input: { turn_detection: { type: "semantic_vad" } },
          output: { voice: "marin" },
        },
      },
    }),
  });

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    return NextResponse.json(
      { available: false, reason: `OpenAI Realtime API rejected the session (${upstream.status}).`, detail },
      { status: 200 },
    );
  }

  const session = (await upstream.json()) as { value: string; expires_at: number };
  return NextResponse.json({
    available: true,
    clientSecret: session.value,
    expiresAt: session.expires_at,
    caseId: body.caseId,
  });
}
