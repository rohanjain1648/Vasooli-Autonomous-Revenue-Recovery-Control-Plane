"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { api } from "@/lib/api";
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

  // The approvals count has to be right the moment a case parks or clears,
  // otherwise the badge argues with the page the reviewer is looking at.
  useEngineEvents((event) => {
    if (event.type === "approval_pending") setPending((n) => n + 1);
    if (event.type === "approval_resolved") setPending((n) => Math.max(0, n - 1));
    setSource("live");
  });

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

        <SourceBadge source={source} className="shrink-0" />
      </div>
    </header>
  );
}
