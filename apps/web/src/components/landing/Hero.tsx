"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { Magnetic } from "@/components/ui/Magnetic";

const FlowField = dynamic(() => import("./FlowField"), { ssr: false });

const EASE = [0.16, 1, 0.3, 1] as const;

export function Hero({ booted }: { booted: boolean }) {
  const [mounted, setMounted] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: viewportRef,
    offset: ["start end", "end start"],
  });
  const viewportY = useTransform(scrollYProgress, [0, 1], reduced ? ["0%", "0%"] : ["4%", "-6%"]);

  useEffect(() => {
    // The canvas is heavy; let the type land first.
    const t = setTimeout(() => setMounted(true), booted ? 240 : 0);
    return () => clearTimeout(t);
  }, [booted]);

  const line = (delay: number) => ({
    initial: { y: "110%" },
    animate: booted ? { y: "0%" } : { y: "110%" },
    transition: { duration: 1.15, delay, ease: EASE },
  });

  return (
    <header className="relative px-6 pt-6 md:px-10 md:pt-8">
      <TopBar booted={booted} />

      <div className="mx-auto max-w-[86rem]">
        <div className="pt-[9vh] pb-8 md:pt-[13vh] md:pb-14">
          <motion.div
            className="label mb-8 text-[var(--color-ink)]/50 md:mb-12"
            initial={{ opacity: 0 }}
            animate={booted ? { opacity: 1 } : {}}
            transition={{ duration: 0.9, delay: 0.15 }}
          >
            Razorpay AI Buildathon 2026 — Track 3
          </motion.div>

          <h1 className="display max-w-[19ch] text-[13vw] leading-[0.88] md:text-[7.6vw] lg:max-w-[22ch]">
            <span className="block overflow-hidden">
              <motion.span className="block" {...line(0.25)}>
                Anyone can report
              </motion.span>
            </span>
            <span className="block overflow-hidden">
              <motion.span className="block" {...line(0.34)}>
                the money that came back.
              </motion.span>
            </span>
            <span className="block overflow-hidden">
              <motion.span
                className="block italic"
                style={{ fontVariationSettings: '"SOFT" 40, "WONK" 1, "opsz" 144' }}
                {...line(0.45)}
              >
                We report the money
              </motion.span>
            </span>
            <span className="block overflow-hidden">
              <motion.span
                className="block italic"
                style={{ fontVariationSettings: '"SOFT" 40, "WONK" 1, "opsz" 144' }}
                {...line(0.54)}
              >
                that wouldn&rsquo;t have.
              </motion.span>
            </span>
          </h1>

          <motion.div
            className="mt-10 grid gap-8 md:mt-14 md:grid-cols-12"
            initial={{ opacity: 0, y: 18 }}
            animate={booted ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 1, delay: 0.8, ease: EASE }}
          >
            <p className="text-[1.0625rem] leading-relaxed text-[var(--color-ink)]/70 md:col-span-6 md:col-start-1 lg:col-span-5">
              Vasooli holds back a random fifth of every at-risk case and never touches it. The
              distance between that cohort and the one it works on — with a confidence interval, on a
              hash-chained ledger you can re-verify yourself — is the only number it takes credit for.
            </p>

            <div className="flex flex-wrap items-start gap-3 md:col-span-5 md:col-start-8 md:justify-end">
              <Magnetic>
                <Link
                  href="/dashboard"
                  data-cursor="Live"
                  className="group inline-flex items-center gap-3 rounded-full bg-[var(--color-ink)] px-6 py-3.5 text-sm font-medium text-[var(--color-paper)] transition-colors hover:bg-[var(--color-treatment)] hover:text-[var(--color-ink)]"
                >
                  Open the console
                  <span className="transition-transform duration-500 group-hover:translate-x-1">→</span>
                </Link>
              </Magnetic>
              <Magnetic strength={0.28}>
                <a
                  href="#method"
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--color-rule)] px-6 py-3.5 text-sm font-medium text-[var(--color-ink)] transition-colors hover:border-[var(--color-ink)]"
                >
                  How it works
                </a>
              </Magnetic>
            </div>
          </motion.div>
        </div>
      </div>

      {/* The instrument, cut into the page. Everything above is the
          argument on paper; this is the machine actually running. */}
      <motion.div
        ref={viewportRef}
        className="relative mx-auto max-w-[86rem]"
        style={{ y: viewportY }}
        initial={{ opacity: 0, scale: 0.985 }}
        animate={booted ? { opacity: 1, scale: 1 } : {}}
        transition={{ duration: 1.4, delay: 0.65, ease: EASE }}
      >
        <div className="on-ink relative h-[52vh] min-h-[340px] overflow-hidden rounded-md bg-[var(--color-ink-deep)] md:h-[58vh]">
          <div className="absolute inset-0">{mounted && <FlowField reveal={booted ? 1 : 0} />}</div>

          {/* Lane annotations. The canvas shows the behaviour; these name it. */}
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-5 md:p-7">
            <div className="flex items-start justify-between gap-4">
              <Annotation title="At risk" body="Detected by CUSUM, TTL, grace-period and aging rules" />
              <Annotation
                title="Policy gate"
                body="Blocked actions stop here"
                tone="treatment"
                align="center"
              />
              <Annotation title="Recovered" body="Outcome written to the ledger" align="right" />
            </div>

            <div className="flex items-end justify-between gap-4">
              <LaneKey />
              <div className="figure hidden text-[10px] text-[var(--color-ink-dim)] sm:block">
                8,000 particles · one per at-risk payment
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </header>
  );
}

function TopBar({ booted }: { booted: boolean }) {
  return (
    <motion.nav
      className="mx-auto flex max-w-[86rem] items-center justify-between"
      initial={{ opacity: 0 }}
      animate={booted ? { opacity: 1 } : {}}
      transition={{ duration: 0.8, delay: 0.1 }}
    >
      <Link href="/" className="display-tight text-2xl tracking-tight">
        Vasooli
      </Link>
      <div className="flex items-center gap-1 sm:gap-2">
        <a
          href="#method"
          className="hidden rounded-full px-4 py-2 text-sm text-[var(--color-ink)]/65 transition-colors hover:text-[var(--color-ink)] sm:block"
        >
          Method
        </a>
        <a
          href="#proof"
          className="hidden rounded-full px-4 py-2 text-sm text-[var(--color-ink)]/65 transition-colors hover:text-[var(--color-ink)] sm:block"
        >
          Proof
        </a>
        <Link
          href="/dashboard"
          className="rounded-full border border-[var(--color-ink)] px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--color-ink)] hover:text-[var(--color-paper)]"
        >
          Console
        </Link>
      </div>
    </motion.nav>
  );
}

function Annotation({
  title,
  body,
  tone,
  align = "left",
}: {
  title: string;
  body: string;
  tone?: "treatment";
  align?: "left" | "center" | "right";
}) {
  const alignment =
    align === "right" ? "text-right items-end" : align === "center" ? "text-center items-center" : "items-start";
  return (
    <div className={`flex max-w-[11rem] flex-col gap-1 ${alignment}`}>
      <span
        className="label"
        style={{ color: tone === "treatment" ? "var(--color-treatment)" : "var(--color-paper)" }}
      >
        {title}
      </span>
      <span className="hidden text-[11px] leading-tight text-[var(--color-ink-dim)] sm:block">{body}</span>
    </div>
  );
}

function LaneKey() {
  return (
    <div className="flex items-center gap-5">
      <span className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ background: "var(--color-treatment)" }} />
        <span className="label text-[var(--color-paper)]/80">Treatment · 80%</span>
      </span>
      <span className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ background: "var(--color-holdout)" }} />
        <span className="label text-[var(--color-ink-dim)]">Holdout · 20%</span>
      </span>
    </div>
  );
}
