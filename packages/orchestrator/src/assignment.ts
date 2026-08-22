import { createHash } from "node:crypto";
import type { ArmGroup } from "@vasooli/core";

/**
 * Stable, deterministic treatment/holdout assignment: sha256(caseId) mod
 * 100 compared to the holdout percentage. Same case id always gets the
 * same arm — no re-randomization on retry, no assignment drift across
 * process restarts (design spec §1 core thesis: the counterfactual
 * requires a randomization that never leaks or resamples).
 */
export function assignArm(caseId: string, holdoutPercent = 20): ArmGroup {
  const hash = createHash("sha256").update(caseId).digest();
  const bucket = hash.readUInt32BE(0) % 100;
  return bucket < holdoutPercent ? "holdout" : "treatment";
}
