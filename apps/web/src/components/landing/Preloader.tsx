"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

const HEX = "0123456789abcdef";

/**
 * Boot sequence. Rather than an abstract spinner it does what the system
 * itself does on startup: walks the audit chain and verifies it. The
 * scrambling hex settles into a real-looking digest as the count
 * completes, so the wait is spent explaining the product.
 *
 * Runs once per tab. A returning visitor gets the page immediately.
 */
export function Preloader({ onDone }: { onDone: () => void }) {
  const [visible, setVisible] = useState(true);
  const [count, setCount] = useState(0);
  const [digest, setDigest] = useState("".padEnd(40, "0"));
  const reduced = useReducedMotion();
  const done = useRef(false);

  useEffect(() => {
    const finish = () => {
      if (done.current) return;
      done.current = true;
      onDone();
      setTimeout(() => setVisible(false), 900);
    };

    if (reduced || sessionStorage.getItem("vasooli:booted")) {
      setVisible(false);
      onDone();
      return;
    }
    sessionStorage.setItem("vasooli:booted", "1");

    const start = performance.now();
    const duration = 2100;
    let frame = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setCount(Math.round(eased * 731)); // ledger entries in the seeded demo batch

      // Characters lock in left to right as the walk completes.
      const locked = Math.floor(eased * 40);
      setDigest((prev) =>
        Array.from({ length: 40 }, (_, i) =>
          i < locked ? prev[i] || HEX[Math.floor(Math.random() * 16)] : HEX[Math.floor(Math.random() * 16)],
        ).join(""),
      );

      if (t < 1) frame = requestAnimationFrame(tick);
      else finish();
    };
    frame = requestAnimationFrame(tick);

    document.documentElement.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(frame);
      document.documentElement.style.overflow = "";
    };
  }, [onDone, reduced]);

  useEffect(() => {
    if (!visible) document.documentElement.style.overflow = "";
  }, [visible]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[200] flex flex-col justify-between bg-[var(--color-paper)] px-6 py-8 md:px-12 md:py-10"
          exit={{ y: "-100%" }}
          transition={{ duration: 1, ease: [0.76, 0, 0.24, 1] }}
        >
          <div className="flex items-baseline justify-between">
            <span className="label text-[var(--color-ink)]/50">Vasooli</span>
            <span className="label text-[var(--color-ink)]/50">Revenue recovery control plane</span>
          </div>

          <div className="flex flex-col items-start gap-6">
            <div className="label text-[var(--color-ink)]/50">Verifying audit chain</div>
            <div className="display text-[22vw] leading-[0.8] md:text-[16vw]">
              <span className="tnum">{String(count).padStart(3, "0")}</span>
            </div>
            <div className="figure w-full overflow-hidden text-[10px] text-[var(--color-ink)]/40 md:text-xs">
              sha256 · {digest}
            </div>
          </div>

          <div className="flex items-end justify-between gap-6">
            <p className="max-w-xs text-sm leading-snug text-[var(--color-ink)]/60">
              Every decision the agent makes is hash-chained. Nothing here is a screenshot.
            </p>
            <div className="h-px flex-1 bg-[var(--color-rule)]">
              <motion.div
                className="h-px bg-[var(--color-treatment)]"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: count / 731 }}
                style={{ transformOrigin: "left" }}
                transition={{ duration: 0.1, ease: "linear" }}
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
