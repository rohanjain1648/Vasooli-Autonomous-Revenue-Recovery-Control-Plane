import { z } from "zod";
import { MoneyPaise } from "./types.js";

/**
 * A Promise-to-Pay: a customer commitment captured during outreach (a
 * voice call, an IVR response, or a human note) that a specific amount
 * will arrive by a specific date. Recording one is advisory only — it
 * never moves money and never bypasses the policy gate; it exists so the
 * product can measure a second, harder-to-fake number than "we sent a
 * message": did the customer's own commitment actually hold?
 */
export const PromiseStateSchema = z.enum(["promised", "honored", "broken", "partial"]);
export type PromiseState = z.infer<typeof PromiseStateSchema>;

/** How the commitment was captured. "voice" is the live realtime agent;
 * "ivr" is the scripted/rendered call; "email" and "sms" are text
 * channels; "manual" is a human logging what a customer told them. */
export const PromiseChannelSchema = z.enum(["voice", "ivr", "email", "sms", "manual"]);
export type PromiseChannel = z.infer<typeof PromiseChannelSchema>;

export const PromiseToPaySchema = z.object({
  id: z.string().uuid(),
  caseId: z.string().uuid(),
  promisedAmountPaise: MoneyPaise,
  /** When the customer committed to paying, as an epoch-ms timestamp. */
  promisedForMs: z.number(),
  channel: PromiseChannelSchema,
  state: PromiseStateSchema,
  /** Free-text context — e.g. a transcript excerpt or the customer's own
   * words — kept for the human reviewing a broken promise. */
  note: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type PromiseToPay = z.infer<typeof PromiseToPaySchema>;

export class InvalidPromiseTransitionError extends Error {
  constructor(
    public readonly from: PromiseState,
    public readonly to: PromiseState,
  ) {
    super(`Invalid promise transition: ${from} -> ${to}`);
    this.name = "InvalidPromiseTransitionError";
  }
}

const PROMISE_TRANSITIONS: Record<PromiseState, readonly PromiseState[]> = {
  // A partial payment can still resolve later — topped up (honored) or
  // written off (broken) — so it isn't terminal the way honored/broken are.
  promised: ["honored", "broken", "partial"],
  partial: ["honored", "broken"],
  honored: [],
  broken: [],
};

export function canTransitionPromise(from: PromiseState, to: PromiseState): boolean {
  return PROMISE_TRANSITIONS[from].includes(to);
}

export function transitionPromise(from: PromiseState, to: PromiseState): PromiseState {
  if (!canTransitionPromise(from, to)) {
    throw new InvalidPromiseTransitionError(from, to);
  }
  return to;
}

export function isPromiseTerminal(state: PromiseState): boolean {
  return PROMISE_TRANSITIONS[state].length === 0;
}
