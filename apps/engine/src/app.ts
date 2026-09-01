/**
 * The engine's importable surface, free of side effects.
 *
 * `index.ts` is the bootstrap — importing it starts a Fastify server and
 * a signal feed — so anything that wants to *embed* the engine (the
 * Next.js app's route handlers, the demo script, tests) imports this
 * instead. Deliberately does not re-export `server.ts`, which would drag
 * Fastify into every consumer's bundle.
 */
export { EngineState } from "./state.js";
export type { EngineConfig, CaseRecord } from "./state.js";
export { EngineEventBus } from "./event-bus.js";
export type { EngineEvent } from "./event-bus.js";
export { computeMetricsSnapshot, computeExperimentsSnapshot } from "./metrics.js";
export { SignalFeed } from "./signal-feed.js";
export { buildPlaybookCatalog, loadPlaybookCatalog } from "./playbooks.js";
export type { PlaybookCatalog, CatalogArm, RawPlaybook, RawPlaybookArm } from "./playbooks.js";
export { toJsonSafe } from "./serialize.js";
export { toCaseSummary, toCaseDetail, toApprovalView } from "./views.js";
