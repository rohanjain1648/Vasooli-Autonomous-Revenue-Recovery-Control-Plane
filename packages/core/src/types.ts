import { z } from "zod";

/** Money is always represented in paise as a non-negative bigint — never a float. */
export const MoneyPaise = z.bigint().nonnegative();

export const LeakageCategory = z.enum([
  "payment_failure",
  "checkout_abandonment",
  "subscription_failure",
  "b2b_receivable",
]);
export type LeakageCategory = z.infer<typeof LeakageCategory>;

export const CaseStateSchema = z.enum([
  "detected",
  "diagnosing",
  "planned",
  "awaiting_approval",
  "executing",
  "recovered",
  "failed",
  "stopped",
  "holdout",
]);
export type CaseState = z.infer<typeof CaseStateSchema>;

export const ArmGroup = z.enum(["treatment", "holdout"]);
export type ArmGroup = z.infer<typeof ArmGroup>;

export const RiskSignalSchema = z.object({
  id: z.string().uuid(),
  category: LeakageCategory,
  entityId: z.string(),
  exposurePaise: MoneyPaise,
  detectedAt: z.string().datetime(),
  evidence: z.record(z.unknown()),
});
export type RiskSignal = z.infer<typeof RiskSignalSchema>;

export const RecoveryCaseSchema = z.object({
  id: z.string().uuid(),
  signalId: z.string().uuid(),
  category: LeakageCategory,
  state: CaseStateSchema,
  armGroup: ArmGroup,
  exposurePaise: MoneyPaise,
  recoveredPaise: MoneyPaise.default(0n),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type RecoveryCase = z.infer<typeof RecoveryCaseSchema>;
