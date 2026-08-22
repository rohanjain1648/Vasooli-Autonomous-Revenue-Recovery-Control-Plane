/**
 * Recursively converts every `bigint` in a value to a decimal string.
 * Money moves through this codebase as `bigint` paise (never a float —
 * see @vasooli/core's MoneyPaise), but JSON.stringify throws on bigint,
 * so every HTTP response and SSE payload must pass through this first.
 */
export function toJsonSafe<T>(value: T): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (value instanceof Map) return Object.fromEntries([...value.entries()].map(([k, v]) => [k, toJsonSafe(v)]));
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      out[key] = toJsonSafe(v);
    }
    return out;
  }
  return value;
}
