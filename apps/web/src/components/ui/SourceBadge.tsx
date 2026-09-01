"use client";

import { sourceLabel, type Source } from "@/lib/useEngineData";

/**
 * States where the numbers came from. A live engine pulses; a seeded
 * replay does not. Never let the two look alike — a reviewer has to be
 * able to tell at a glance whether they are watching something happen or
 * reading something that already did.
 */
export function SourceBadge({ source, className }: { source: Source; className?: string }) {
  const { text, live } = sourceLabel(source);

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 ${className ?? ""}`}
      style={{
        borderColor: live ? "var(--color-recovered)" : "currentColor",
        color: live ? "var(--color-recovered)" : "var(--color-ink-dim)",
      }}
      title={
        live
          ? "Connected to the engine's event stream"
          : "Engine not reachable — showing the committed output of a seeded batch"
      }
    >
      <span className="relative flex h-1.5 w-1.5">
        {live && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-70" />
        )}
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
      </span>
      <span className="label">{text}</span>
    </span>
  );
}
