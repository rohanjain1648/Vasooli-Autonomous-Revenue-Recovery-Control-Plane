# ADR 0005: Offline-first provider abstraction for every paid dependency

**Status:** Accepted

## Context

The build window may not have LLM or Razorpay credentials available at
every point, and — more importantly — a live demo on stage must never
depend on a third-party API succeeding at that exact moment. A network
blip or rate limit during the pitch would be fatal to a system whose whole
argument is "trust the numbers on this dashboard."

## Decision

Every external paid dependency sits behind a narrow interface with two
implementations, selected by a factory that checks environment variables:

| Package | Interface | Live adapter | Offline fake | Factory |
|---|---|---|---|---|
| `@vasooli/llm` | `LlmProvider` | `OpenaiAdapter` (OpenAI- or Groq-compatible `/chat/completions`) | `MockLlmProvider` (pure function of input) | `createLlmProvider()` |
| `@vasooli/razorpay` | `RazorpayClient` | `LiveRazorpayClient` (real REST calls) | `FakeRazorpayClient` (seeded, in-memory, realistic shapes) | `createRazorpayClient()` |

Presence of `GROQ_API_KEY` / `OPENAI_API_KEY` / (`RAZORPAY_KEY_ID` +
`RAZORPAY_KEY_SECRET`) flips the corresponding adapter to live — no code
change anywhere else in the system. With nothing set, the whole pipeline
(simulator → detector → orchestrator → executor → ledger → dashboard) runs
end to end with zero network calls, using the same seeded-PRNG pattern
(`createSeededRandom`, duplicated deliberately in `@vasooli/stats`,
`@vasooli/simulator`, and `@vasooli/razorpay` rather than cross-imported,
so each package has no runtime dependency on the others for its own
determinism) across every fake.

## Consequences

- `pnpm demo` and the whole test suite never make a network call, ever —
  this was true from the first commit and stayed true through every
  package added afterward, verified by review rather than a lint rule.
- The live adapters throw explicitly on anything out of scope rather than
  silently no-op-ing: `LiveRazorpayClient.applyDiscount()` /
  `.sendNotification()` throw "out of scope for this demo" errors (design
  spec §13), and `OpenaiAdapter` throws on a diagnosis response that
  fails `isValidDiagnosis()` rather than returning a default.
- A judge with real credentials can flip the switch and get real behavior
  with the identical code paths already covered by tests — the fakes and
  the live adapters implement the same interface, so nothing downstream
  needs to know which one it's talking to.
