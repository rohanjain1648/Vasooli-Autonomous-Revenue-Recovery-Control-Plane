"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

type CallStatus = "idle" | "connecting" | "active" | "ended" | "unavailable" | "error";

interface TranscriptLine {
  role: "agent" | "customer";
  text: string;
}

/** Loose shape of the realtime events this component reads. Deliberately
 * not a strict discriminated union: this is an external wire protocol
 * this codebase doesn't control, and every field below is read
 * defensively (optional chaining, no assumed presence) rather than
 * trusted as exhaustive. */
interface RealtimeServerEvent {
  type: string;
  delta?: string;
  transcript?: string;
  response?: {
    output?: Array<{ type: string; name?: string; call_id?: string; arguments?: string }>;
  };
  error?: { message?: string };
}

/**
 * A live, speech-to-speech call with the customer, running entirely in
 * the browser via WebRTC against OpenAI's Realtime API. The only thing
 * this component is allowed to do to the rest of the system is call the
 * existing POST /api/cases/:id/promise route when the model reports a
 * commitment — it never touches money and never bypasses the policy
 * gate, exactly like the IVR and manual channels.
 *
 * Needs OPENAI_API_KEY set server-side; without it, /api/voice/session
 * reports {available: false} and this renders a plain disabled state
 * rather than a broken button.
 */
export function VoiceAgent({ caseId, onPromiseRecorded }: { caseId: string; onPromiseRecorded?: () => void }) {
  const [status, setStatus] = useState<CallStatus>("idle");
  const [reason, setReason] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [agentPartial, setAgentPartial] = useState("");

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  const cleanup = () => {
    dcRef.current?.close();
    dcRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  useEffect(() => () => cleanup(), []);

  const recordPromiseFromCall = async (args: {
    amount_rupees?: number;
    days_from_now?: number;
    note?: string;
  }): Promise<{ ok: boolean; error?: string }> => {
    if (typeof args.amount_rupees !== "number" || typeof args.days_from_now !== "number") {
      return { ok: false, error: "missing amount or date" };
    }
    try {
      await api.recordPromise(caseId, {
        promisedAmountPaise: String(Math.round(args.amount_rupees * 100)),
        promisedForMs: Date.now() + args.days_from_now * 24 * 60 * 60 * 1000,
        channel: "voice",
        note: args.note,
      });
      onPromiseRecorded?.();
      return { ok: true };
    } catch {
      return { ok: false, error: "the recovery system could not save this — tell the customer a human will confirm" };
    }
  };

  const handleServerEvent = async (event: RealtimeServerEvent) => {
    if (event.type === "response.audio_transcript.delta") {
      setAgentPartial((prev) => prev + (event.delta ?? ""));
      return;
    }

    if (event.type === "response.audio_transcript.done") {
      setAgentPartial((prev) => {
        if (prev) setTranscript((t) => [...t, { role: "agent", text: prev }]);
        return "";
      });
      return;
    }

    if (event.type === "conversation.item.input_audio_transcription.completed") {
      const text = event.transcript;
      if (text) setTranscript((t) => [...t, { role: "customer", text }]);
      return;
    }

    if (event.type === "response.done") {
      const output = event.response?.output ?? [];
      for (const item of output) {
        if (item.type !== "function_call" || item.name !== "record_promise_to_pay") continue;
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(item.arguments ?? "{}");
        } catch {
          // Malformed arguments from the model — report failure back so it
          // can try again rather than silently dropping the commitment.
        }
        const result = await recordPromiseFromCall(args);
        dcRef.current?.send(
          JSON.stringify({
            type: "conversation.item.create",
            item: {
              type: "function_call_output",
              call_id: item.call_id,
              output: JSON.stringify(result),
            },
          }),
        );
        dcRef.current?.send(JSON.stringify({ type: "response.create" }));
      }
      return;
    }

    if (event.type === "error") {
      console.error("[voice] realtime error event:", event);
    }
  };

  const start = async () => {
    setStatus("connecting");
    setReason(null);
    setTranscript([]);
    setAgentPartial("");

    try {
      const res = await fetch("/api/voice/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId }),
      });
      const data = (await res.json()) as
        | { available: true; clientSecret: string }
        | { available: false; reason: string };

      if (!data.available) {
        setStatus("unavailable");
        setReason(data.reason);
        return;
      }

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      pc.ontrack = (event) => {
        if (audioElRef.current) audioElRef.current.srcObject = event.streams[0];
      };

      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = mic;
      mic.getTracks().forEach((track) => pc.addTrack(track, mic));

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      dc.addEventListener("message", (e) => {
        void handleServerEvent(JSON.parse(e.data));
      });
      dc.addEventListener("open", () => {
        setStatus("active");
        // Best-effort: ask the session to also transcribe the customer's
        // own speech, so the panel can show both sides of the call. If
        // this field name is wrong for the API version in use, the
        // session ignores it or reports an `error` event above — the
        // call itself is unaffected either way.
        dc.send(
          JSON.stringify({
            type: "session.update",
            session: { type: "realtime", audio: { input: { transcription: { model: "whisper-1" } } } },
          }),
        );
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpRes = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${data.clientSecret}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp,
      });
      if (!sdpRes.ok) throw new Error(`Realtime handshake failed (${sdpRes.status})`);
      const answerSdp = await sdpRes.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
    } catch (err) {
      cleanup();
      setStatus("error");
      setReason(err instanceof Error ? err.message : "Could not start the call.");
    }
  };

  const end = () => {
    cleanup();
    setStatus("ended");
  };

  return (
    <section className="panel p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="label text-[var(--color-ink-dim)]">Live voice agent</span>
        {status === "active" && (
          <span className="chip inline-flex items-center gap-1.5" style={{ color: "var(--color-treatment)", borderColor: "var(--color-treatment)" }}>
            <span className="h-1 w-1 animate-pulse rounded-full bg-current" />
            on call
          </span>
        )}
      </div>

      <audio ref={audioElRef} autoPlay hidden />

      {status === "idle" && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-[var(--color-ink-dim)]">
            Speech-to-speech in the browser. The model can only capture a commitment — it never
            moves money or bypasses the policy gate.
          </p>
          <button
            onClick={start}
            data-cursor="Call"
            className="shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-opacity"
            style={{ background: "var(--color-treatment)", color: "var(--color-ink)" }}
          >
            Take the call
          </button>
        </div>
      )}

      {status === "connecting" && (
        <p className="text-sm text-[var(--color-ink-dim)]">Connecting — allow microphone access when asked…</p>
      )}

      {status === "unavailable" && (
        <p className="text-sm text-[var(--color-ink-dim)]">
          {reason ?? "Live voice isn't configured for this deployment."}
        </p>
      )}

      {status === "error" && (
        <div className="space-y-2">
          <p className="text-sm" style={{ color: "var(--color-blocked)" }}>
            {reason ?? "Something went wrong starting the call."}
          </p>
          <button
            onClick={start}
            className="chip border border-[var(--color-ink-rule)] transition-colors hover:border-[var(--color-treatment)] hover:text-[var(--color-treatment)]"
          >
            Try again
          </button>
        </div>
      )}

      {(status === "active" || status === "ended") && (
        <div>
          <div className="max-h-64 space-y-2 overflow-y-auto rounded bg-[var(--color-ink-deep)] p-3">
            {transcript.length === 0 && !agentPartial && (
              <p className="text-xs text-[var(--color-ink-dim)]">Listening…</p>
            )}
            {transcript.map((line, i) => (
              <p key={i} className="text-sm leading-relaxed">
                <span
                  className="label mr-2"
                  style={{
                    color: line.role === "agent" ? "var(--color-treatment)" : "var(--color-holdout)",
                  }}
                >
                  {line.role === "agent" ? "Agent" : "Customer"}
                </span>
                {line.text}
              </p>
            ))}
            {agentPartial && (
              <p className="text-sm leading-relaxed opacity-70">
                <span className="label mr-2" style={{ color: "var(--color-treatment)" }}>
                  Agent
                </span>
                {agentPartial}
              </p>
            )}
          </div>
          {status === "active" && (
            <button
              onClick={end}
              className="mt-3 rounded-full border border-[var(--color-ink-rule)] px-4 py-2 text-sm font-medium transition-colors hover:border-[var(--color-blocked)] hover:text-[var(--color-blocked)]"
            >
              End call
            </button>
          )}
        </div>
      )}
    </section>
  );
}
