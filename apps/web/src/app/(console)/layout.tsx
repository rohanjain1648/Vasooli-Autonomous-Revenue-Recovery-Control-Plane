"use client";

import { useEffect } from "react";
import { ConsoleNav } from "@/components/console/ConsoleNav";

/**
 * The console runs on the ink surface. The flag goes on <body> rather
 * than a wrapper so the scrollbar and overscroll gutter change with it —
 * a light scrollbar against a dark page is the tell that a theme was
 * bolted on rather than designed.
 */
export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.body.dataset.surface = "ink";
    return () => {
      delete document.body.dataset.surface;
    };
  }, []);

  return (
    <div className="on-ink min-h-screen bg-[var(--color-ink-deep)] text-[var(--color-paper)]">
      <ConsoleNav />
      <main className="mx-auto max-w-[92rem] px-4 py-8 md:px-8 md:py-10">{children}</main>
    </div>
  );
}
