import { formatCategory, formatState } from "@/lib/format";

/**
 * Chips carry the two things a reader scans for: where a case is, and
 * which cohort it belongs to. Colour is doing real work here — treatment
 * marigold and holdout steel are the same pair used by the gap meter and
 * the hero's particle lanes, so the association is learned once.
 */

const STATE_TONE: Record<string, string> = {
  detected: "var(--color-ink-dim)",
  diagnosing: "var(--color-ink-dim)",
  planned: "var(--color-ink-dim)",
  awaiting_approval: "var(--color-treatment)",
  deferred: "var(--color-pending)",
  executing: "var(--color-treatment)",
  holdout: "var(--color-holdout)",
  recovered: "var(--color-recovered)",
  failed: "var(--color-blocked)",
  stopped: "var(--color-blocked)",
};

function tinted(color: string, filled = false) {
  return {
    color,
    borderColor: color,
    background: filled ? `color-mix(in srgb, ${color} 16%, transparent)` : "transparent",
  };
}

export function StateBadge({ state }: { state: string }) {
  const color = STATE_TONE[state] ?? "var(--color-ink-dim)";
  const live = state === "executing" || state === "diagnosing";
  return (
    <span className="chip inline-flex items-center gap-1.5" style={tinted(color, true)}>
      {live && <span className="h-1 w-1 animate-pulse rounded-full bg-current" />}
      {formatState(state)}
    </span>
  );
}

const CATEGORY_TONE: Record<string, string> = {
  payment_failure: "#c98b8b",
  checkout_abandonment: "#9a95cf",
  subscription_failure: "#c294c4",
  b2b_receivable: "#84aebd",
};

export function CategoryBadge({ category }: { category: string }) {
  return (
    <span className="chip" style={tinted(CATEGORY_TONE[category] ?? "var(--color-ink-dim)")}>
      {formatCategory(category)}
    </span>
  );
}

export function ArmGroupBadge({ armGroup }: { armGroup: string }) {
  const treatment = armGroup === "treatment";
  return (
    <span
      className="chip"
      style={tinted(treatment ? "var(--color-treatment)" : "var(--color-holdout)", treatment)}
    >
      {treatment ? "Treatment" : "Holdout"}
    </span>
  );
}

const PROMISE_STATE_TONE: Record<string, string> = {
  promised: "var(--color-treatment)",
  partial: "var(--color-pending)",
  honored: "var(--color-recovered)",
  broken: "var(--color-blocked)",
};

export function PromiseStateBadge({ state }: { state: string }) {
  const color = PROMISE_STATE_TONE[state] ?? "var(--color-ink-dim)";
  return (
    <span className="chip inline-flex items-center gap-1.5" style={tinted(color, true)}>
      {state === "promised" && <span className="h-1 w-1 animate-pulse rounded-full bg-current" />}
      {formatState(state)}
    </span>
  );
}

const CHANNEL_LABEL: Record<string, string> = {
  voice: "Live voice",
  ivr: "IVR call",
  email: "Email",
  sms: "SMS",
  manual: "Manual",
};

export function ChannelBadge({ channel }: { channel: string }) {
  return <span className="chip text-[var(--color-ink-dim)]">{CHANNEL_LABEL[channel] ?? channel}</span>;
}

export function DecisionBadge({ decision }: { decision?: string }) {
  if (!decision) return <span className="text-[var(--color-ink-dim)]">—</span>;
  const tone =
    decision === "PASS"
      ? "var(--color-recovered)"
      : decision === "BLOCK"
        ? "var(--color-blocked)"
        : decision === "DEFER"
          ? "var(--color-pending)"
          : "var(--color-treatment)";
  return (
    <span className="chip" style={tinted(tone)}>
      {decision.replace(/_/g, " ")}
    </span>
  );
}
