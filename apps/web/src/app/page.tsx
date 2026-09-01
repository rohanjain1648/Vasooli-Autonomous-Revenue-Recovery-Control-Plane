"use client";

import { useCallback, useState } from "react";
import { Preloader } from "@/components/landing/Preloader";
import { Hero } from "@/components/landing/Hero";
import { Problem, Pipeline, PolicyGate, LedgerSection, Specs } from "@/components/landing/Sections";
import { LiveProof } from "@/components/landing/LiveProof";
import { Closing, CodeMarquee } from "@/components/landing/Closing";

export default function LandingPage() {
  const [booted, setBooted] = useState(false);
  const onDone = useCallback(() => setBooted(true), []);

  return (
    <>
      <Preloader onDone={onDone} />
      <main>
        <Hero booted={booted} />
        <Problem />
        <CodeMarquee />
        <Pipeline />
        <PolicyGate />
        <LiveProof />
        <LedgerSection />
        <Specs />
        <Closing />
      </main>
    </>
  );
}
