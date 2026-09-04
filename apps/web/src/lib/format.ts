/** Formats a paise value (string or number, since money crosses the wire
 * as a decimal string — see @vasooli/core's MoneyPaiseJson) as an Indian-
 * grouped ₹ amount, e.g. "₹2,90,000". */
export function formatPaise(paise: string | number | undefined | null): string {
  if (paise === undefined || paise === null) return "₹0";
  const rupees = Number(paise) / 100;
  return `₹${rupees.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

/** Compact ₹ form for headline numbers, e.g. "₹2.9L" / "₹1.2Cr". */
export function formatPaiseCompact(paise: string | number | undefined | null): string {
  if (paise === undefined || paise === null) return "₹0";
  const rupees = Number(paise) / 100;
  const abs = Math.abs(rupees);
  if (abs >= 1_00_00_000) return `₹${(rupees / 1_00_00_000).toFixed(2)}Cr`;
  if (abs >= 1_00_000) return `₹${(rupees / 1_00_000).toFixed(2)}L`;
  if (abs >= 1_000) return `₹${(rupees / 1_000).toFixed(1)}k`;
  return `₹${rupees.toFixed(0)}`;
}

export function formatPercent(rate: number | undefined | null, digits = 1): string {
  if (rate === undefined || rate === null || Number.isNaN(rate)) return "—";
  return `${(rate * 100).toFixed(digits)}%`;
}

export function formatDateTime(iso: string | number | undefined | null): string {
  if (iso === undefined || iso === null || iso === "") return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatCategory(category: string): string {
  return category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatState(state: string): string {
  return state.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
