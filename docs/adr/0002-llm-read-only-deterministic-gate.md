# ADR 0002: The LLM is read-only; a deterministic policy gate approves every action

**Status:** Accepted

## Context

The panel's first question about any agent touching real money will be
"how do you stop it from doing something wrong." An LLM that reads a
prompt and decides to issue a refund or waive a fee is a liability no
amount of prompt engineering fully closes — it can hallucinate a
justification, misread an amount, or simply be talked into an unsafe
action by adversarial input in the data it's reasoning over.

## Decision

The LLM never has write access to anything. Its only two capabilities
(`packages/llm/src/provider.ts`'s `LlmProvider` interface) are:

- `diagnose(signal): DiagnosisOutput` — a Zod-shaped `{rootCause,
  confidence, evidenceCode, recommendedSegment}`, purely descriptive.
- `generateContent(arm, context): string` — template text for whichever
  playbook arm the bandit already selected; it does not choose the arm.

The actual path from signal to executed action is fixed and cannot be
short-circuited by any LLM output:

```
signal → diagnose (LLM, read-only) → plan (Thompson-sampling bandit,
never the LLM) → POLICY GATE (deterministic YAML rules) → execute
```

The **policy gate** (`packages/policy`) is plain deterministic code:
a list of `PolicyRule`s (TRAI quiet hours, economic viability, max
touches, cool-off, hard-stop-on-terminal-state, human-approval-for-
high-risk) each returning `PASS | BLOCK | DEFER | NEEDS_APPROVAL`, combined
by "most restrictive wins" (`packages/policy/src/evaluator.ts`). No LLM
call sits anywhere in this evaluation. Every verdict — including ones a
stricter rule overrode — is retained and appended to the audit ledger.

## Consequences

- Every `DiagnosisOutput` is validated with `isValidDiagnosis()`
  (`packages/llm/src/provider.ts`) before use; the live adapter
  (`packages/llm/src/openai-adapter.ts`) throws rather than silently
  defaulting on a malformed response — there is no code path where an
  LLM's free text is parsed and acted on directly.
- A `NEEDS_APPROVAL` verdict parks the case at `awaiting_approval`
  indefinitely until a human calls `approveAndExecute()` or
  `rejectApproval()` (`packages/orchestrator/src/orchestrator.ts`) — the
  dashboard's Approvals inbox is this human-in-the-loop surface.
- This is testable without any LLM at all: `MockLlmProvider`
  (`packages/llm/src/mock-adapter.ts`) is a pure function of its input,
  so every policy and orchestration test in this repo runs deterministically
  offline, and the same test suite exercises the exact code path a live
  key would use.
