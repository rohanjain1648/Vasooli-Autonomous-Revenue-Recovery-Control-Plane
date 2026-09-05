"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { api } from "@/lib/api";
import type { CircuitBreakerStatus } from "@/lib/api";
import { useEngineEvents } from "@/lib/useEngineEvents";
import { SourceBadge } from "@/components/ui/SourceBadge";
import type { Source } from "@/lib/useEngineData";

const TABS = [
  { href: "/dashboard", label: "Money wall" },
  { href: "/cases", label: "Cases" },
  { href: "/approvals", label: "Approvals" },
  { href: "/promises", label: "Promises" },
  { href: "/audit", label: "Audit" },
  { href: "/experiments", label: "Experiments" },
];

export function ConsoleNav() {
  const pathname = usePathname() ?? "";
  const [source, setSource] = useState<Source>("connecting");
  const [pending, setPending] = useState(0);
  const [breaker, setBreaker] = useState<CircuitBreakerStatus | null>(null);
  const [breakerBusy, setBreakerBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const approvals = await api.approvals();
        if (cancelled) return;
        setPending(approvals.length);
        setSource("live");
      } catch {
        if (!cancelled) setSource((prev) => (prev === "live" ? "live" : "seeded"));
      }
    };
    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .breaker()
      .then((status) => {
        if (!cancelled) setBreaker(status);
      })
      .catch(() => {
        // Not reachable yet — the periodic approvals check above will
        // eventually flip `source`, and the banner simply stays hidden.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The approvals count has to be right the moment a case parks or clears,
  // otherwise the badge argues with the page the reviewer is looking at.
  useEngineEvents((event) => {
    if (event.type === "approval_pending") setPending((n) => n + 1);
    if (event.type === "approval_resolved") setPending((n) => Math.max(0, n - 1));
    if (event.type === "circuit_breaker_tripped") {
      setBreaker({ tripped: true, reason: event.reason, trippedBy: event.trippedBy });
    }
    if (event.type === "circuit_breaker_reset") {
      setBreaker({ tripped: false });
    }
    setSource("live");
  });

  async function stopNow() {
    setBreakerBusy(true);
    try {
      setBreaker(await api.tripBreaker());
    } finally {
      setBreakerBusy(false);
    }
  }

  async function resume() {
    setBreakerBusy(true);
    try {
      setBreaker(await api.resetBreaker());
    } finally {
      setBreakerBusy(false);
    }
  }

  const active = TABS.find((tab) => pathname.startsWith(tab.href))?.href;

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--color-ink-rule)] bg-[var(--color-ink-deep)]/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[92rem] items-center gap-4 px-4 py-3 md:px-8">
        <Link
          href="/"
          data-cursor="Home"
          className="display-tight shrink-0 text-xl text-[var(--color-paper)] transition-colors hover:text-[var(--color-treatment)]"
        >
          Vasooli
        </Link>

        <nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          {TABS.map((tab) => {
            const isActive = active === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className="relative shrink-0 rounded-md px-3 py-1.5 text-sm transition-colors"
                style={{ color: isActive ? "var(--color-paper)" : "var(--color-ink-dim)" }}
              >
                {isActive && (
                  <motion.span
                    layoutId="console-tab"
                    className="absolute inset-0 rounded-md bg-[var(--color-ink-raised)]"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
                <span className="relative flex items-center gap-2">
                  {tab.label}
                  {tab.href === "/approvals" && pending > 0 && (
                    <span
                      className="figure rounded-full px-1.5 py-px text-[10px] font-semibold"
                      style={{ background: "var(--color-treatment)", color: "var(--color-ink)" }}
                    >
                      {pending}
                    </span>
                  )}
                </span>
              </Link>
            );
          })}
        </nav>

        <button
          onClick={() => void (breaker?.tripped ? resume() : stopNow())}
          disabled={breakerBusy}
          data-cursor={breaker?.tripped ? "Resume" : "Stop"}
          className="shrink-0 rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-wide transition-colors disabled:opacity-50"
          style={
            breaker?.tripped
              ? { borderColor: "var(--color-blocked)", color: "var(--color-blocked)" }
              : { borderColor: "var(--color-ink-rule)", color: "var(--color-ink-dim)" }
          }
        >
          {breaker?.tripped ? "Resume" : "Stop"}
        </button>

        <SourceBadge source={source} className="shrink-0" />
      </div>

      {breaker?.tripped && (
        <div
          className="border-t px-4 py-2 text-sm md:px-8"
          style={{ borderColor: "var(--color-blocked)", background: "color-mix(in srgb, var(--color-blocked) 16%, transparent)" }}
        >
          <span className="font-medium" style={{ color: "var(--color-blocked)" }}>
            Circuit breaker tripped ({breaker.trippedBy === "auto" ? "automatic" : "manual"}):
          </span>{" "}
          <span className="text-[var(--color-ink-dim)]">{breaker.reason ?? "no reason recorded"}</span>
          {" — "}
          <span className="text-[var(--color-ink-dim)]">every new case is being stopped before diagnosis.</span>
        </div>
      )}
    </header>
  );
}
