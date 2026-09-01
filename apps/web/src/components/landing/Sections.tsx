"use client";

import { Reveal, RevealWords } from "@/components/ui/Reveal";

/* ============================================================
   Shared section furniture
   ============================================================ */

function SectionHead({
  eyebrow,
  title,
  lede,
  id,
}: {
  eyebrow: string;
  title: string;
  lede?: string;
  id?: string;
}) {
  return (
    <div id={id} className="scroll-mt-24">
      <Reveal>
        <div className="label mb-6 text-[var(--color-ink)]/45">{eyebrow}</div>
      </Reveal>
      <h2 className="display-tight max-w-[16ch] text-[9vw] md:text-[4.4vw]">
        <RevealWords text={title} />
      </h2>
      {lede && (
        <Reveal delay={0.1}>
          <p className="mt-6 max-w-[52ch] text-[1.0625rem] leading-relaxed text-[var(--color-ink)]/70">
            {lede}
          </p>
        </Reveal>
      )}
    </div>
  );
}

/* ============================================================
   1 — The problem
   ============================================================ */

export function Problem() {
  return (
    <section className="mx-auto max-w-[86rem] px-6 py-[14vh] md:px-10">
      <SectionHead
        eyebrow="The problem with gross recovery"
        title="Half of that money was coming back anyway."
        lede="A customer whose card was declined by a downed issuer will often retry on their own an hour later. If your agent emailed them in between, it takes the credit. Gross recovery cannot tell those two cases apart, which means it cannot be checked, reproduced, or argued with."
      />

      <div className="mt-16 grid gap-px overflow-hidden rounded-md bg-[var(--color-rule)] md:mt-20 md:grid-cols-2">
        <Reveal className="bg-[var(--color-paper-raised)] p-8 md:p-10">
          <div className="label mb-5 text-[var(--color-ink)]/45">What everyone reports</div>
          <div className="display text-[15vw] leading-[0.85] md:text-[6vw]">₹4.2L</div>
          <div className="mt-4 text-sm leading-relaxed text-[var(--color-ink)]/60">
            Gross recovered. Every rupee that came back after the agent touched a case, whether or not
            the agent had anything to do with it. Unfalsifiable by construction.
          </div>
        </Reveal>

        <Reveal delay={0.12} className="bg-[var(--color-ink)] p-8 text-[var(--color-paper)] md:p-10">
          <div className="label mb-5 text-[var(--color-ink-dim)]">What Vasooli reports</div>
          <div
            className="display text-[15vw] leading-[0.85] md:text-[6vw]"
            style={{ color: "var(--color-treatment)" }}
          >
            ₹2.9L
          </div>
          <div className="mt-4 text-sm leading-relaxed text-[var(--color-ink-dim)]">
            Incremental, at 95% confidence, measured against a cohort we deliberately left alone. The
            rest of the gross figure is money that was always coming home.
          </div>
        </Reveal>
      </div>

      <Reveal delay={0.1}>
        <p className="mt-8 max-w-[60ch] text-sm leading-relaxed text-[var(--color-ink)]/55">
          The difference is not a rounding error. It is the difference between a number you can put in
          a board deck and a number you can defend in one.
        </p>
      </Reveal>
    </section>
  );
}

/* ============================================================
   2 — The pipeline
   ============================================================ */

type Actor = "Deterministic" | "Model" | "Bandit" | "Human";

const STAGES: { n: string; name: string; body: string; actor: Actor }[] = [
  {
    n: "01",
    name: "Detect",
    body: "CUSUM change-point on per-cohort success rates, checkout TTL expiry, mandate grace periods, invoice aging buckets. Real Razorpay error codes throughout.",
    actor: "Deterministic",
  },
  {
    n: "02",
    name: "Assign",
    body: "sha256(case id) mod 100 decides treatment or holdout. Stable across retries and restarts, and re-checkable by anyone holding the case id.",
    actor: "Deterministic",
  },
  {
    n: "03",
    name: "Diagnose",
    body: "The model proposes a root cause, a confidence, an evidence code and a segment. Schema-validated on arrival. It cannot pick an action and cannot move money.",
    actor: "Model",
  },
  {
    n: "04",
    name: "Plan",
    body: "Thompson sampling over Beta posteriors picks the playbook arm. The model writes the copy for the arm that was already chosen — it never chooses.",
    actor: "Bandit",
  },
  {
    n: "05",
    name: "Gate",
    body: "Every rule runs, every verdict is kept, most restrictive wins. Nothing reaches the executor without passing here.",
    actor: "Deterministic",
  },
  {
    n: "06",
    name: "Approve",
    body: "Discounts, fee waivers and anything above the auto-approve threshold park in an inbox until a person decides. Rejection stops the case dead.",
    actor: "Human",
  },
  {
    n: "07",
    name: "Execute",
    body: "Durable steps with per-step retry and reverse-order compensation. A failure half way through unwinds what already happened.",
    actor: "Deterministic",
  },
  {
    n: "08",
    name: "Measure",
    body: "Wilson and Newcombe intervals, mSPRT for an always-valid p-value. Outcomes feed straight back into the bandit's posteriors.",
    actor: "Deterministic",
  },
];

const ACTOR_STYLE: Record<Actor, string> = {
  Deterministic: "border-[var(--color-rule)] text-[var(--color-ink)]/55",
  Model: "border-[var(--color-treatment)] text-[var(--color-treatment-soft)] bg-[var(--color-treatment)]/10",
  Bandit: "border-[var(--color-recovered)] text-[var(--color-recovered)]",
  Human: "border-[var(--color-blocked)] text-[var(--color-blocked)]",
};

export function Pipeline() {
  return (
    <section className="mx-auto max-w-[86rem] px-6 py-[14vh] md:px-10">
      <SectionHead
        id="method"
        eyebrow="The path from signal to action"
        title="Eight steps. The model is allowed to speak at exactly one of them."
        lede="This ordering is the safety story. A language model proposes a diagnosis and writes copy; a bandit chooses the intervention; deterministic code decides whether anything happens at all. Nothing skips the gate."
      />

      <ol className="mt-16 md:mt-20">
        {STAGES.map((stage, i) => (
          <Reveal key={stage.n} delay={i * 0.03}>
            <li className="rule-t grid grid-cols-[3rem_1fr] items-start gap-x-4 gap-y-2 py-6 md:grid-cols-[4rem_11rem_1fr_9rem] md:gap-x-8 md:py-7">
              <span className="figure pt-1 text-sm text-[var(--color-ink)]/35">{stage.n}</span>
              <h3 className="display-tight text-2xl md:pt-0.5 md:text-[1.75rem]">{stage.name}</h3>
              <p className="col-span-2 max-w-[62ch] text-sm leading-relaxed text-[var(--color-ink)]/65 md:col-span-1">
                {stage.body}
              </p>
              <div className="col-span-2 md:col-span-1 md:justify-self-end">
                <span className={`chip border ${ACTOR_STYLE[stage.actor]}`}>{stage.actor}</span>
              </div>
            </li>
          </Reveal>
        ))}
        <div className="rule-t" />
      </ol>
    </section>
  );
}

/* ============================================================
   3 — The policy gate
   ============================================================ */

const RULES: { id: string; rule: string; verdict: "BLOCK" | "DEFER" | "NEEDS_APPROVAL"; when: string }[] = [
  {
    id: "hard_stop_terminal",
    rule: "Hard stop on terminal cases",
    verdict: "BLOCK",
    when: "Case already recovered, failed or stopped",
  },
  {
    id: "economic_viability",
    rule: "Economic viability",
    verdict: "BLOCK",
    when: "Action costs more than the amount it could recover",
  },
  {
    id: "max_touches_per_case",
    rule: "Touch cap",
    verdict: "BLOCK",
    when: "Three outreach attempts already made",
  },
  {
    id: "trai_quiet_hours",
    rule: "TRAI quiet hours",
    verdict: "DEFER",
    when: "Local time between 21:00 and 09:00",
  },
  {
    id: "cool_off_between_touches",
    rule: "Cool-off window",
    verdict: "DEFER",
    when: "Under four hours since the last touch",
  },
  {
    id: "human_approval_high_risk",
    rule: "Human sign-off",
    verdict: "NEEDS_APPROVAL",
    when: "Discount, fee waiver, or above the auto-approve threshold",
  },
];

const VERDICT_COLOR: Record<string, string> = {
  BLOCK: "var(--color-blocked)",
  DEFER: "var(--color-pending)",
  NEEDS_APPROVAL: "var(--color-treatment-soft)",
};

export function PolicyGate() {
  return (
    <section className="bg-[var(--color-ink)] text-[var(--color-paper)]">
      <div className="on-ink mx-auto max-w-[86rem] px-6 py-[14vh] md:px-10">
        <Reveal>
          <div className="label mb-6 text-[var(--color-ink-dim)]">The gate</div>
        </Reveal>
        <h2 className="display-tight max-w-[18ch] text-[9vw] md:text-[4.4vw]">
          <RevealWords text="Six rules stand between a proposal and a rupee." />
        </h2>
        <Reveal delay={0.1}>
          <p className="mt-6 max-w-[54ch] text-[1.0625rem] leading-relaxed text-[var(--color-ink-dim)]">
            Every rule runs on every case. Each returns a verdict and a reason, all of them are written
            to the ledger, and the most restrictive one governs — a BLOCK is never quietly downgraded
            because something else returned PASS.
          </p>
        </Reveal>

        <div className="mt-14 md:mt-16">
          {RULES.map((rule, i) => (
            <Reveal key={rule.id} delay={i * 0.04}>
              <div className="rule-t grid grid-cols-1 items-baseline gap-x-8 gap-y-1 py-5 md:grid-cols-[13rem_1fr_11rem]">
                <div>
                  <div className="text-base font-medium">{rule.rule}</div>
                  <div className="figure text-[10px] text-[var(--color-ink-dim)]">{rule.id}</div>
                </div>
                <div className="text-sm text-[var(--color-ink-dim)]">{rule.when}</div>
                <div className="md:justify-self-end">
                  <span
                    className="chip border"
                    style={{ color: VERDICT_COLOR[rule.verdict], borderColor: VERDICT_COLOR[rule.verdict] }}
                  >
                    {rule.verdict}
                  </span>
                </div>
              </div>
            </Reveal>
          ))}
          <div className="rule-t" />
        </div>

        <Reveal delay={0.1}>
          <p className="mt-10 max-w-[58ch] text-sm leading-relaxed text-[var(--color-ink-dim)]">
            Twenty-six tests cover this file alone, one per rule per verdict, plus the combinations
            where two rules disagree.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ============================================================
   4 — The ledger
   ============================================================ */

export function LedgerSection() {
  return (
    <section className="mx-auto max-w-[86rem] px-6 py-[14vh] md:px-10">
      <div className="grid gap-14 md:grid-cols-12">
        <div className="md:col-span-6">
          <SectionHead
            eyebrow="The audit trail"
            title="Don't take the server's word for it."
            lede="Every transition, verdict, diagnosis and step outcome is appended to a hash-chained ledger. The audit page re-hashes the entire chain in your browser with Web Crypto and tells you what it found — it does not ask the API whether the API is trustworthy."
          />
          <Reveal delay={0.15}>
            <div className="mt-8 flex flex-wrap gap-x-8 gap-y-3">
              <Stat label="Chain" value="SHA-256" />
              <Stat label="Serialisation" value="Canonical JSON" />
              <Stat label="Tamper test" value="In the suite" />
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.1} className="md:col-span-6">
          <ChainDiagram />
        </Reveal>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="label text-[var(--color-ink)]/40">{label}</div>
      <div className="figure mt-1 text-sm">{value}</div>
    </div>
  );
}

const CHAIN = [
  { actor: "orchestrator", action: "detected", hash: "eb3da79e2cd9" },
  { actor: "llm", action: "diagnosed", hash: "7f41c76c91c3" },
  { actor: "bandit", action: "planned", hash: "b4639a53c1a2" },
  { actor: "policy", action: "policy_evaluated", hash: "c885bf584d72" },
  { actor: "human", action: "approved", hash: "4c29bec89a4c" },
  { actor: "executor", action: "execution_result", hash: "9d3bb6a1240b" },
  { actor: "orchestrator", action: "recovered", hash: "80876955fe75" },
];

function ChainDiagram() {
  return (
    <div className="on-ink overflow-hidden rounded-md bg-[var(--color-ink)] p-5 text-[var(--color-paper)] md:p-7">
      <div className="mb-5 flex items-center justify-between">
        <span className="label text-[var(--color-ink-dim)]">Case timeline</span>
        <span className="chip border" style={{ color: "var(--color-recovered)", borderColor: "var(--color-recovered)" }}>
          chain valid
        </span>
      </div>

      <ol className="relative">
        {CHAIN.map((entry, i) => (
          <li key={entry.hash} className="relative flex gap-4 pb-5 last:pb-0">
            {i < CHAIN.length - 1 && (
              <span
                className="absolute left-[5px] top-3 h-full w-px"
                style={{ background: "var(--color-ink-rule)" }}
                aria-hidden
              />
            )}
            <span
              className="relative mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full border-2"
              style={{
                borderColor: i === CHAIN.length - 1 ? "var(--color-recovered)" : "var(--color-treatment)",
                background: "var(--color-ink)",
              }}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span className="text-sm font-medium">{entry.action}</span>
                <span className="label text-[var(--color-ink-dim)]">{entry.actor}</span>
              </div>
              <div className="figure mt-0.5 truncate text-[10px] text-[var(--color-ink-dim)]">
                prev · {entry.hash}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ============================================================
   5 — What it is made of
   ============================================================ */

const SPECS = [
  { k: "Tests", v: "160", note: "across 13 packages, none touching the network" },
  { k: "Statistics", v: "Hand-rolled", note: "Wilson, Newcombe, CUSUM, Thompson, mSPRT" },
  { k: "Money", v: "bigint paise", note: "no float arithmetic anywhere in the system" },
  { k: "Runs offline", v: "By default", note: "mock model and payment fake, seeded and deterministic" },
  { k: "Replay", v: "Byte-identical", note: "same seed reproduces the same batch exactly" },
  { k: "Database", v: "None", note: "in-memory engine state; nothing to stand up first" },
];

export function Specs() {
  return (
    <section className="mx-auto max-w-[86rem] px-6 py-[14vh] md:px-10">
      <SectionHead
        eyebrow="What it is made of"
        title="A TypeScript monorepo with nothing hiding in it."
      />
      <div className="mt-14 grid gap-px overflow-hidden rounded-md bg-[var(--color-rule)] sm:grid-cols-2 lg:grid-cols-3">
        {SPECS.map((spec, i) => (
          <Reveal key={spec.k} delay={i * 0.04} className="bg-[var(--color-paper-raised)] p-7">
            <div className="label text-[var(--color-ink)]/45">{spec.k}</div>
            <div className="display-tight mt-3 text-3xl">{spec.v}</div>
            <div className="mt-2 text-sm leading-relaxed text-[var(--color-ink)]/60">{spec.note}</div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
