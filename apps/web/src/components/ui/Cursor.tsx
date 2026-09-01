"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Two-part cursor: a hairline ring that lags behind a solid dot. On
 * anything marked `data-cursor="…"` the ring swells and the label inside
 * it names the action, so the pointer itself carries the affordance.
 *
 * Only ever mounts on a fine pointer with hover — touch and keyboard
 * users keep the platform default, and the native cursor is only hidden
 * (via body[data-cursor="on"]) once this is actually running, so a JS
 * failure can never leave a visitor with no pointer at all.
 */
export function Cursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const [label, setLabel] = useState<string | null>(null);
  const [active, setActive] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine || reduced) return;

    setEnabled(true);
    document.body.dataset.cursor = "on";

    const pos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const ring = { x: pos.x, y: pos.y };
    let frame = 0;

    const onMove = (event: PointerEvent) => {
      pos.x = event.clientX;
      pos.y = event.clientY;
      if (dotRef.current) {
        dotRef.current.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
      }

      const interactive = (event.target as HTMLElement | null)?.closest?.(
        "a, button, [data-cursor], input, select, textarea",
      ) as HTMLElement | null;
      setActive(Boolean(interactive));
      setLabel(interactive?.dataset.cursor ?? null);
    };

    // The ring eases toward the dot rather than tracking it exactly —
    // the lag is what makes the pointer feel weighted.
    const tick = () => {
      ring.x += (pos.x - ring.x) * 0.16;
      ring.y += (pos.y - ring.y) * 0.16;
      if (ringRef.current) {
        ringRef.current.style.transform = `translate3d(${ring.x}px, ${ring.y}px, 0)`;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    const onLeave = () => setActive(false);

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      delete document.body.dataset.cursor;
    };
  }, []);

  if (!enabled) return null;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[9999]">
      <div
        ref={dotRef}
        className="absolute -left-[3px] -top-[3px] h-[6px] w-[6px] rounded-full bg-[var(--color-treatment)]"
        style={{ willChange: "transform" }}
      />
      <div
        ref={ringRef}
        className="absolute flex items-center justify-center rounded-full border transition-[width,height,margin,border-color,background-color] duration-300"
        style={{
          willChange: "transform",
          width: label ? 76 : active ? 44 : 26,
          height: label ? 76 : active ? 44 : 26,
          marginLeft: label ? -38 : active ? -22 : -13,
          marginTop: label ? -38 : active ? -22 : -13,
          borderColor: active ? "var(--color-treatment)" : "currentColor",
          backgroundColor: label ? "color-mix(in srgb, var(--color-treatment) 14%, transparent)" : "transparent",
          opacity: active ? 1 : 0.35,
        }}
      >
        {label && (
          <span className="label text-[9px] leading-none text-[var(--color-treatment)]">{label}</span>
        )}
      </div>
    </div>
  );
}
