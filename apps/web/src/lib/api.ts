/**
 * Empty string means same-origin: the Next.js route handlers under
 * /api embed the engine directly, so the dashboard is one deployable
 * thing. Point NEXT_PUBLIC_ENGINE_URL at the standalone Fastify service
 * (`pnpm dev:engine`, default :4000) to use that instead.
 */
export const ENGINE_URL = process.env.NEXT_PUBLIC_ENGINE_URL ?? "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${ENGINE_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${init?.method ?? "GET"} ${path} -> ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export interface RecoveryCaseView {
  id: string;
  signalId: string;
  category: string;
  state: string;
  armGroup: "treatment" | "holdout";
  exposurePaise: string;
  recoveredPaise: string;
  createdAt: string;
  updatedAt: string;
  signalCategory?: string;
  entityId?: string;
  diagnosis?: {
    rootCause: string;
    confidence: number;
    evidenceCode: string;
    recommendedSegment: string;
  };
  selectedArm?: string;
  policyDecision?: string;
  needsApproval?: boolean;
}

export interface CaseDetailView extends RecoveryCaseView {
  signal: {
    id: string;
    category: string;
    entityId: string;
    exposurePaise: string;
    detectedAt: string;
    evidence: Record<string, unknown>;
  };
  pendingArm?: { name: string; description: string; requiresApproval: boolean; template?: string };
  transitions: LedgerEntryView[];
}

export interface LedgerEntryView {
  index: number;
  timestamp: string;
  actor: string;
  caseId: string;
  action: string;
  payload: unknown;
  prevHash: string;
  hash: string;
}

export interface CohortStatsView {
  n: number;
  inFlight: number;
  successes: number;
  successRate: number;
  recoveredPaise: string;
}

export interface MetricsSnapshot {
  detected: number;
  recovered: number;
  blocked: number;
  deferred: number;
  grossPaise: string;
  treatment: CohortStatsView;
  holdout: CohortStatsView;
  incrementalPaise: string;
  ciWidthPaise: string;
  pValue: number;
  upliftRateDiff: number;
  upliftRateLower: number;
  upliftRateUpper: number;
}

export interface ExperimentCohort {
  category: string;
  treatment: CohortStatsView;
  holdout: CohortStatsView;
  uplift: { pValue: number; diff: number; statistic: number; n: number };
  rateInterval: { diff: number; lower: number; upper: number };
}

export const api = {
  metrics: () => request<MetricsSnapshot>("/api/metrics"),
  cases: (filter: { state?: string; category?: string; limit?: number } = {}) => {
    const params = new URLSearchParams();
    if (filter.state) params.set("state", filter.state);
    if (filter.category) params.set("category", filter.category);
    if (filter.limit) params.set("limit", String(filter.limit));
    const qs = params.toString();
    return request<RecoveryCaseView[]>(`/api/cases${qs ? `?${qs}` : ""}`);
  },
  case: (id: string) => request<CaseDetailView>(`/api/cases/${id}`),
  approvals: () => request<CaseDetailView[]>("/api/approvals"),
  approve: (id: string) => request<{ ok: true; case: RecoveryCaseView }>(`/api/approvals/${id}/approve`, { method: "POST" }),
  reject: (id: string) => request<{ ok: true; case: RecoveryCaseView }>(`/api/approvals/${id}/reject`, { method: "POST" }),
  audit: (verify: boolean) => request<{ entries: LedgerEntryView[]; valid?: boolean; firstBrokenIndex?: number | null }>(`/api/audit?verify=${verify}`),
  experiments: () => request<ExperimentCohort[]>("/api/experiments"),
};
