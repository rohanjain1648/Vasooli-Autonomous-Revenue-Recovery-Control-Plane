"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { Magnetic } from "@/components/ui/Magnetic";
import { Reveal, RevealWords } from "@/components/ui/Reveal";

/** Real error codes the detectors key off. Grounding, not decoration. */
const CODES = [
  "issuer_down",
  "insufficient_funds",
  "card_expired",
  "authentication_failed",
  "limit_exceeded",
  "mandate_charge_failed",
  "checkout_timeout",
  "promise_to_pay_breach",
  "GATEWAY_ERROR",
];

export function CodeMarquee() {
  const reduced = useReducedMotion();
  const row = [...CODES, ...CODES];

  return (
    <div className="rule-t rule-b overflow-hidden py-5" aria-hidden>
      <motion.div
        className="flex w-max gap-10 whitespace-nowrap"
        animate={reduced ? {} : { x: ["0%", "-50%"] }}
        transition={{ duration: 42, ease: "linear", repeat: Infinity }}
      >
        {row.map((code, i) => (
          <span key={`${code}-${i}`} className="figure flex items-center gap-10 text-sm text-[var(--color-ink)]/35">
            {code}
            <span className="h-1 w-1 rounded-full bg-[var(--color-rule)]" />
          </span>
        ))}
      </motion.div>
    </div>
  );
}

export function Closing() {
  return (
    <footer className="mx-auto max-w-[86rem] px-6 pb-10 pt-[14vh] md:px-10">
      <h2 className="display max-w-[14ch] text-[13vw] leading-[0.88] md:text-[7vw]">
        <RevealWords text="Watch it recover money" />
        <br />
        <span className="italic" style={{ fontVariationSettings: '"SOFT" 40, "WONK" 1, "opsz" 144' }}>
          <RevealWords text="in real time." delay={0.2} />
        </span>
      </h2>

      <Reveal delay={0.15}>
        <div className="mt-12 flex flex-wrap items-center gap-3">
          <Magnetic>
            <Link
              href="/dashboard"
              data-cursor="Live"
              className="group inline-flex items-center gap-3 rounded-full bg-[var(--color-ink)] px-7 py-4 text-[0.9375rem] font-medium text-[var(--color-paper)] transition-colors hover:bg-[var(--color-treatment)] hover:text-[var(--color-ink)]"
            >
              Open the console
              <span className="transition-transform duration-500 group-hover:translate-x-1">→</span>
            </Link>
          </Magnetic>
          <Magnetic strength={0.25}>
            <Link
              href="/approvals"
              className="inline-flex items-center gap-2 rounded-full border border-[var(--color-rule)] px-7 py-4 text-[0.9375rem] font-medium transition-colors hover:border-[var(--color-ink)]"
            >
              Approve something
            </Link>
          </Magnetic>
        </div>
      </Reveal>

      <Reveal delay={0.2}>
        <div className="rule-t mt-20 grid gap-8 pt-8 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <div className="label mb-3 text-[var(--color-ink)]/40">Run it yourself</div>
            <code className="figure block rounded bg-[var(--color-paper-sunk)] px-3 py-2 text-xs">
              pnpm demo
            </code>
            <p className="mt-2 text-xs leading-relaxed text-[var(--color-ink)]/50">
              Seeded, offline, byte-identical on every run.
            </p>
          </div>
          <FooterLinks
            title="Console"
            links={[
              { label: "Money wall", href: "/dashboard" },
              { label: "Cases", href: "/cases" },
              { label: "Approvals", href: "/approvals" },
              { label: "Audit log", href: "/audit" },
              { label: "Experiments", href: "/experiments" },
            ]}
          />
          <div>
            <div className="label mb-3 text-[var(--color-ink)]/40">Decisions</div>
            <ul className="space-y-1.5 text-sm text-[var(--color-ink)]/60">
              <li>Incremental, never gross</li>
              <li>Model proposes, never acts</li>
              <li>Money is integer paise</li>
              <li>Ledger verifies in your browser</li>
            </ul>
          </div>
          <div>
            <div className="label mb-3 text-[var(--color-ink)]/40">Built for</div>
            <p className="text-sm leading-relaxed text-[var(--color-ink)]/60">
              Razorpay AI Buildathon 2026, Track 3 — AI Revenue Recovery.
            </p>
          </div>
        </div>
      </Reveal>

      <div className="rule-t mt-10 flex flex-wrap items-center justify-between gap-4 pt-6">
        <span className="display-tight text-xl">Vasooli</span>
        <span className="label text-[var(--color-ink)]/35">वसूली — recovery, collection</span>
      </div>
    </footer>
  );
}

function FooterLinks({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <div>
      <div className="label mb-3 text-[var(--color-ink)]/40">{title}</div>
      <ul className="space-y-1.5">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="text-sm text-[var(--color-ink)]/60 transition-colors hover:text-[var(--color-ink)]"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
