"use client";

import { useEffect, useRef, useState } from "react";
import { useInView, useReducedMotion } from "motion/react";

/**
 * Counts a figure up when it scrolls into view. Formatting is injected
 * so the same primitive drives rupee amounts, percentages and plain
 * counts without any of them learning about each other.
 *
 * Always renders through `format`, including the final frame, so the
 * settled value is identical to what a static render would have shown.
 */
export function CountUp({
  to,
  from = 0,
  duration = 1.6,
  format = (v: number) => v.toFixed(0),
  className,
  live = false,
}: {
  to: number;
  from?: number;
  duration?: number;
  format?: (value: number) => string;
  className?: string;
  /** Re-animate from the previous value whenever `to` changes, for
   *  figures that update from a live feed rather than on first view. */
  live?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: !live, margin: "-8% 0px" });
  const reduced = useReducedMotion();
  const [value, setValue] = useState(from);
  const previous = useRef(from);

  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      setValue(to);
      previous.current = to;
      return;
    }

    const start = performance.now();
    const origin = live ? previous.current : from;
    const delta = to - origin;
    let frame = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / (duration * 1000));
      // Expo-out: fast commitment, long settle. Matches the page's easing.
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      setValue(origin + delta * eased);
      if (t < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        previous.current = to;
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, to, from, duration, reduced, live]);

  return (
    <span ref={ref} className={`tnum ${className ?? ""}`}>
      {format(value)}
    </span>
  );
}
