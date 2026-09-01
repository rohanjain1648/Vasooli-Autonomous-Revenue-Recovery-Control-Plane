"use client";

import { motion, useInView, useReducedMotion } from "motion/react";
import { useRef } from "react";

/**
 * The product's thesis as a single device, and the one element the page
 * is meant to be remembered by.
 *
 * Two tracks, one per cohort, and a bracket in the gutter measuring the
 * distance between them. Gross recovery is the top bar alone; the only
 * number Vasooli claims credit for is the bracket. It recurs at three
 * scales — hero, proof section, console — so the argument is the same
 * shape everywhere it appears.
 */
export function GapMeter({
  treatmentRate,
  holdoutRate,
  treatmentN,
  holdoutN,
  deltaLabel,
  significant,
  tone = "ink",
  size = "md",
}: {
  treatmentRate: number;
  holdoutRate: number;
  treatmentN: number;
  holdoutN: number;
  /** What the gap is worth. Rendered inside the bracket. */
  deltaLabel: string;
  significant?: boolean;
  tone?: "ink" | "paper";
  size?: "sm" | "md" | "lg";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-15% 0px" });
  const reduced = useReducedMotion();

  const onInk = tone === "ink";
  const dim = onInk ? "text-[var(--color-ink-dim)]" : "text-[var(--color-ink)]/55";
  const track = onInk ? "bg-[var(--color-ink-raised)]" : "bg-[var(--color-paper-sunk)]";
  const bracket = onInk ? "border-[var(--color-ink-rule)]" : "border-[var(--color-rule)]";

  const barH = size === "lg" ? "h-3" : size === "sm" ? "h-1.5" : "h-2";
  const gapPts = (treatmentRate - holdoutRate) * 100;

  const grow = (value: number) => ({
    initial: { scaleX: 0 },
    animate: { scaleX: inView || reduced ? Math.max(0.004, Math.min(1, value)) : 0 },
  });

  return (
    <div ref={ref} className="w-full">
      <Row
        label="Treatment"
        sublabel={`n=${treatmentN}`}
        rate={treatmentRate}
        color="var(--color-treatment)"
        track={track}
        dim={dim}
        barH={barH}
        anim={grow(treatmentRate)}
        delay={0.1}
        size={size}
      />

      {/* The gutter. This is the space the whole product exists to measure. */}
      <div className="relative flex items-stretch gap-3 py-1 pl-[7.5rem] sm:pl-[9rem]">
        <div className={`w-3 shrink-0 border-y border-l ${bracket}`} aria-hidden />
        <motion.div
          className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2"
          initial={{ opacity: 0, x: -6 }}
          animate={inView || reduced ? { opacity: 1, x: 0 } : {}}
          transition={{ duration: 0.7, delay: 0.75, ease: [0.16, 1, 0.3, 1] }}
        >
          <span
            className={`figure font-semibold ${
              size === "lg" ? "text-2xl" : size === "sm" ? "text-sm" : "text-lg"
            }`}
            style={{ color: "var(--color-treatment)" }}
          >
            {deltaLabel}
          </span>
          <span className={`label ${dim}`}>
            {gapPts >= 0 ? "+" : ""}
            {gapPts.toFixed(1)} pts incremental
          </span>
          {significant !== undefined && (
            <span
              className="chip"
              style={
                significant
                  ? { color: "var(--color-recovered)", borderColor: "var(--color-recovered)" }
                  : { color: onInk ? "var(--color-ink-dim)" : "inherit", borderColor: "currentColor", opacity: 0.6 }
              }
            >
              {significant ? "significant" : "collecting"}
            </span>
          )}
        </motion.div>
      </div>

      <Row
        label="Holdout"
        sublabel={`n=${holdoutN}`}
        rate={holdoutRate}
        color="var(--color-holdout)"
        track={track}
        dim={dim}
        barH={barH}
        anim={grow(holdoutRate)}
        delay={0.32}
        size={size}
      />
    </div>
  );
}

function Row({
  label,
  sublabel,
  rate,
  color,
  track,
  dim,
  barH,
  anim,
  delay,
  size,
}: {
  label: string;
  sublabel: string;
  rate: number;
  color: string;
  track: string;
  dim: string;
  barH: string;
  anim: { initial: { scaleX: number }; animate: { scaleX: number } };
  delay: number;
  size: "sm" | "md" | "lg";
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-[7rem] shrink-0 sm:w-[8.25rem]">
        <div className="label" style={{ color }}>
          {label}
        </div>
        <div className={`figure text-[10px] ${dim}`}>{sublabel}</div>
      </div>

      <div className={`relative flex-1 ${barH} ${track} overflow-hidden rounded-[1px]`}>
        <motion.div
          className="absolute inset-y-0 left-0 w-full origin-left rounded-[1px]"
          style={{ background: color }}
          initial={anim.initial}
          animate={anim.animate}
          transition={{ duration: 1.15, delay, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>

      <div
        className={`figure w-16 shrink-0 text-right font-semibold ${
          size === "lg" ? "text-xl" : size === "sm" ? "text-xs" : "text-base"
        }`}
        style={{ color }}
      >
        {(rate * 100).toFixed(1)}%
      </div>
    </div>
  );
}
