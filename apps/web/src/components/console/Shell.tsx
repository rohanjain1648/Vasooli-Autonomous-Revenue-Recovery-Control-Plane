"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";

const EASE = [0.16, 1, 0.3, 1] as const;

/** Every console view opens the same way, so moving between tabs reads
 *  as one application rather than five pages. */
export function PageIn({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

export function PageHead({
  title,
  sub,
  actions,
}: {
  title: string;
  sub?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="display-tight text-3xl md:text-[2.5rem]">{title}</h1>
        {sub && <p className="mt-2 max-w-[62ch] text-sm text-[var(--color-ink-dim)]">{sub}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  tone?: string;
}) {
  return (
    <div className="panel p-4">
      <div className="label text-[var(--color-ink-dim)]">{label}</div>
      <div className="figure mt-2 text-2xl" style={tone ? { color: tone } : undefined}>
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-[var(--color-ink-dim)]">{sub}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="panel px-6 py-16 text-center text-sm text-[var(--color-ink-dim)]">{children}</div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-[var(--color-ink-raised)] ${className ?? "h-24"}`}
      aria-hidden
    />
  );
}
