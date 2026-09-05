import "server-only";

import {
  EngineState,
  SignalFeed,
  buildPlaybookCatalog,
  computeMetricsSnapshot,
} from "@vasooli/engine";
import { PolicyEngine, defaultRules, confidenceLadderRule, preDebitNotificationRule } from "@vasooli/policy";
import { createLlmProvider } from "@vasooli/llm";
import { createRazorpayClient } from "@vasooli/razorpay";
import { PLAYBOOKS } from "./playbooks.generated";

/**
 * An engine instance living inside the Next.js server, so the dashboard is
 * a single deployable thing rather than a frontend that is useless without
 * someone remembering to start a second process. `apps/engine` remains the
 * standalone Fastify service; both drive the exact same EngineState.
 *
 * Held on globalThis because Next reloads route modules in development and
 * would otherwise hand every request a fresh, empty world.
 */

const WARMUP_TICKS = 40;
const TICK_MS = 4000;
/** Cases deliberately left parked so the approvals inbox is never empty
 *  for the first person to open the link. */
const KEEP_PENDING = 4;

type Instance = { state: EngineState; feed: SignalFeed; ready: Promise<EngineState> };

declare global {
  // eslint-disable-next-line no-var
  var __vasooliEngine: Instance | undefined;
}

/**
 * A cold start would otherwise serve an empty money wall to whoever opened
 * the link first. Seeding is deterministic, so every instance — and every
 * visitor — starts from the same populated world.
 */
async function warmUp(state: EngineState, feed: SignalFeed): Promise<EngineState> {
  // A live LLM provider (OPENAI_API_KEY/GROQ_API_KEY set) can fail a given
  // call for reasons that have nothing to do with this codebase — a rate
  // limit, a transient network blip, a provider outage. One bad tick must
  // not poison the whole engine: getState() awaits this promise, so an
  // uncaught rejection here would fail every route until the process
  // restarts. This mirrors the tolerance feed.start()'s own tick loop
  // already has for exactly the same call, once the server is running —
  // warmUp() was just never given the same protection.
  for (let i = 0; i < WARMUP_TICKS; i++) {
    try {
      await feed.tick();
    } catch (err) {
      console.error(`[engine] warmup tick ${i + 1}/${WARMUP_TICKS} failed, continuing:`, err);
    }
  }

  // Resolve most of what is parked, so the wall has settled outcomes to
  // measure rather than a backlog of pending cases.
  const pending = state.listApprovals();
  for (const record of pending.slice(0, Math.max(0, pending.length - KEEP_PENDING))) {
    try {
      await state.approve(record.case.id);
    } catch (err) {
      console.error(`[engine] warmup approval for case ${record.case.id} failed, leaving it pending:`, err);
    }
  }

  feed.start(TICK_MS);
  return state;
}

function create(): Instance {
  // See apps/engine/src/index.ts's identical line for why these numbers
  // are wired in here specifically rather than living in defaultRules().
  const promiseRetryNoticeMs = 90_000;
  const state = new EngineState({
    llmProvider: createLlmProvider(),
    razorpayClient: createRazorpayClient(),
    policyEngine: new PolicyEngine([
      ...defaultRules(),
      confidenceLadderRule(),
      preDebitNotificationRule(promiseRetryNoticeMs),
    ]),
    catalog: buildPlaybookCatalog(PLAYBOOKS),
    rngSeed: 1,
    holdoutPercent: 20,
    promiseRetryNoticeMs,
  });

  const feed = new SignalFeed(state, 42);
  return { state, feed, ready: warmUp(state, feed) };
}

function getEngine(): Instance {
  if (!globalThis.__vasooliEngine) {
    globalThis.__vasooliEngine = create();
  }
  return globalThis.__vasooliEngine;
}

/**
 * The only accessor route handlers should use. Awaiting readiness is what
 * stops the first request after a cold start from reporting zero recovered
 * revenue on a dashboard whose whole point is the number.
 */
export function getState(): Promise<EngineState> {
  return getEngine().ready;
}

/** For the event stream, which wants to attach a subscriber immediately
 *  and does not care whether the warm-up batch has finished. */
export function getStateNow(): EngineState {
  return getEngine().state;
}

export { computeMetricsSnapshot };
