import { formatCategory, formatState } from "@/lib/format";

const STATE_COLORS: Record<string, string> = {
  detected: "bg-slate-700 text-slate-200",
  diagnosing: "bg-slate-700 text-slate-200",
  planned: "bg-slate-700 text-slate-200",
  awaiting_approval: "bg-amber-900 text-amber-300",
  deferred: "bg-amber-900 text-amber-300",
  executing: "bg-blue-900 text-blue-300",
  holdout: "bg-slate-700 text-slate-300",
  recovered: "bg-emerald-900 text-emerald-300",
  failed: "bg-rose-950 text-rose-300",
  stopped: "bg-rose-950 text-rose-300",
};

export function StateBadge({ state }: { state: string }) {
  return (
    <span className={`pill ${STATE_COLORS[state] ?? "bg-slate-700 text-slate-200"}`}>
      {formatState(state)}
    </span>
  );
}

const CATEGORY_COLORS: Record<string, string> = {
  payment_failure: "bg-rose-950 text-rose-300",
  checkout_abandonment: "bg-indigo-950 text-indigo-300",
  subscription_failure: "bg-fuchsia-950 text-fuchsia-300",
  b2b_receivable: "bg-cyan-950 text-cyan-300",
};

export function CategoryBadge({ category }: { category: string }) {
  return (
    <span className={`pill ${CATEGORY_COLORS[category] ?? "bg-slate-700 text-slate-200"}`}>
      {formatCategory(category)}
    </span>
  );
}

export function ArmGroupBadge({ armGroup }: { armGroup: string }) {
  return (
    <span
      className={`pill ${
        armGroup === "treatment" ? "bg-blue-950 text-blue-300" : "bg-slate-700 text-slate-300"
      }`}
    >
      {armGroup === "treatment" ? "Treatment" : "Holdout"}
    </span>
  );
}
