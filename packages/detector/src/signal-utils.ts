import { randomUUID } from "node:crypto";
import { RiskSignalSchema } from "@vasooli/core";
import type { LeakageCategory } from "@vasooli/core";
import type { RiskSignal } from "./types.js";

/** Build and validate a RiskSignal — the single choke point every detector
 * routes through, so every emitted signal is guaranteed schema-valid. */
export function makeSignal(params: {
  category: LeakageCategory;
  entityId: string;
  exposurePaise: bigint;
  nowMs: number;
  evidence: Record<string, unknown>;
}): RiskSignal {
  return RiskSignalSchema.parse({
    id: randomUUID(),
    category: params.category,
    entityId: params.entityId,
    exposurePaise: params.exposurePaise,
    detectedAt: new Date(params.nowMs).toISOString(),
    evidence: params.evidence,
  });
}
