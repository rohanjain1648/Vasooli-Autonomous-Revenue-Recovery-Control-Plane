# Vasooli Plan 4: LLM Agent & Executor (Days 9–10)

> **Prerequisites:** Plan 3 complete (policy gate working, playbooks defined).  
> **Scope:** LLM provider abstraction (OpenAI, Groq, mock), RAG, agent loop, executor, Razorpay adapter.  
> **Stack:** TypeScript, LangChain or direct API calls, vector DB (optional for MVP).

---

## Overview

**Goal:** Implement the agent loop:
1. **Diagnose (LLM + RAG):** Read-only tools, Zod-validated output
2. **Plan (bandit):** Thompson sampling arm selection over (segment, playbook) pairs
3. **Policy gate:** Already done (Plan 3)
4. **Execute:** Durable step runner with retries, compensations, write-back to Razorpay

All external calls (LLM, Razorpay) happen behind provider abstraction: live adapters or offline deterministic fakes.

---

## Deliverables

### 1. **packages/llm** (new)
Provider abstraction:
- `LlmProvider` interface with two implementations: OpenAI/Groq, Mock
- Tool definitions: structured output (Zod schemas)
- Diagnose agent: reads cohort stats, customer history, knowledge corpus
- Write-only guardrail: no money-moving operations in agent code

### 2. **packages/razorpay** (new)
Razorpay adapter:
- Live client (REST API, real credentials)
- In-memory fake with realistic responses and latency simulation
- Common interface, swapped via env var

### 3. **packages/executor** (new)
Durable action executor:
- Step DAG (detect → diagnose → plan → approve → execute → measure)
- Retry logic (exponential backoff, jitter)
- Compensation (rollback on failure, idempotency keys)
- Write-back to Razorpay (apply_refund, apply_discount, send_notification)

### 4. **apps/engine** updates
Orchestrator service wiring all pieces:
- Ingest signal → trigger agent loop → policy gate → executor → measurement
- Request tracing, error handling, backpressure

### 5. **Tests**
- Mock LLM produces structured diagnoses
- Bandit arm selection deterministic for seeded Thompson
- Executor retries on transient failure, compensates on permanent
- Razorpay fake responds like real API, but no network calls

---

## Implementation Tasks

### Task 1: Create `packages/llm`

**Files:**
- `packages/llm/package.json`
- `packages/llm/src/provider.ts` (interface)
- `packages/llm/src/openai-adapter.ts` (live client)
- `packages/llm/src/mock-adapter.ts` (deterministic fake)
- `packages/llm/src/diagnose.ts` (agent loop)
- `packages/llm/src/tools.ts` (read-only tool definitions)
- `packages/llm/src/index.ts`
- `packages/llm/src/*.test.ts`

**Key types:**
```typescript
export interface DiagnosisOutput {
  rootCause: string;
  confidence: number; // 0–1
  evidenceCode: string; // e.g. "HDFC_down"
  recommendedSegment: string; // e.g. "high_value"
}

export interface LlmProvider {
  diagnose(signal: RiskSignal): Promise<DiagnosisOutput>;
  generateContent(playbook: Playbook, arm: PlaybookArm, context: any): Promise<string>;
}

export class OpenaiDiagnoseAgent {
  tools = [
    {
      name: "get_cohort_stats",
      description: "Retrieve rolling 7-day success rate for a cohort",
      inputSchema: z.object({ cohort_id: z.string() }),
      impl: (input) => db.getCohortStats(input.cohort_id)
    },
    {
      name: "get_entity_history",
      description: "Retrieve payment history for a customer",
      inputSchema: z.object({ entity_id: z.string() }),
      impl: (input) => db.getEntityHistory(input.entity_id)
    },
    {
      name: "search_knowledge",
      description: "Search knowledge corpus (RBI rules, error codes, etc.)",
      inputSchema: z.object({ query: z.string() }),
      impl: (input) => knowledge.search(input.query)
    }
  ];
  
  async diagnose(signal: RiskSignal): Promise<DiagnosisOutput> {
    // Tool-use loop with OpenAI
    // Returns Zod-validated DiagnosisOutput
  }
}

export class MockLlmProvider {
  // Seeded deterministic output for testing
  async diagnose(signal: RiskSignal): Promise<DiagnosisOutput> {
    return {
      rootCause: `Mock diagnosis for ${signal.category}`,
      confidence: 0.85,
      evidenceCode: "MOCK_ISSUER_DOWN",
      recommendedSegment: signal.exposurePaise > 1000000n ? "high_value" : "standard"
    };
  }
}
```

**Tests:**
- Mock provider returns deterministic diagnosis for same signal
- OpenAI adapter (if credentials supplied) produces structured output
- Tool outputs validate to schemas
- Diagnosis output Zod-validates correctly

### Task 2: Create `packages/razorpay`

**Files:**
- `packages/razorpay/package.json`
- `packages/razorpay/src/types.ts` (API response types)
- `packages/razorpay/src/client.ts` (interface)
- `packages/razorpay/src/live-client.ts` (REST API)
- `packages/razorpay/src/fake-client.ts` (in-memory, seeded latency)
- `packages/razorpay/src/index.ts`
- `packages/razorpay/src/*.test.ts`

**Key types:**
```typescript
export interface RazorpayClient {
  applyRefund(paymentId: string, amountPaise: bigint): Promise<{ id: string; status: "success" | "pending" }>;
  applyDiscount(customerId: string, discountPaise: bigint, expiresAt: Date): Promise<{ id: string }>;
  sendNotification(customerId: string, channel: "sms" | "email", content: string): Promise<{ id: string }>;
  getPaymentStatus(paymentId: string): Promise<PaymentStatus>;
}

export class LiveRazorpayClient implements RazorpayClient {
  // Make real API calls
  async applyRefund(paymentId: string, amountPaise: bigint) {
    const response = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}/refund`, {
      method: "POST",
      headers: { "Authorization": `Basic ${btoa(`${this.keyId}:${this.keySecret}`)}` },
      body: JSON.stringify({ amount: amountPaise })
    });
    return response.json();
  }
}

export class FakeRazorpayClient implements RazorpayClient {
  // In-memory, deterministic with seeded latency
  private store: Map<string, any> = new Map();
  
  async applyRefund(paymentId: string, amountPaise: bigint) {
    const latency = Math.random() * 500; // Simulate 0–500ms latency
    await new Promise(r => setTimeout(r, latency));
    return { id: `refund_${Date.now()}`, status: "success" };
  }
}
```

**Tests:**
- Fake client responses are valid Razorpay API shapes
- Latency is simulated, deterministic for testing
- Same seed → same response (for offline testing)
- Live client (if credentials) uses real API, credentials from env var

### Task 3: Create `packages/executor`

**Files:**
- `packages/executor/package.json`
- `packages/executor/src/step.ts` (Step interface, DAG)
- `packages/executor/src/executor.ts` (durable runner)
- `packages/executor/src/compensation.ts` (rollback logic)
- `packages/executor/src/index.ts`
- `packages/executor/src/*.test.ts`

**Key types:**
```typescript
export interface Step {
  id: string;
  name: string;
  impl: (context: ExecutionContext) => Promise<any>;
  retryPolicy?: { maxAttempts: number; backoffMs: number };
  compensation?: (context: ExecutionContext) => Promise<void>;
}

export interface ExecutionContext {
  caseId: string;
  signal: RiskSignal;
  diagnosis: DiagnosisOutput;
  playbookArm: PlaybookArm;
  results: Map<string, any>; // Results from prior steps
  razorpayClient: RazorpayClient;
  ledger: Ledger;
}

export class DurableExecutor {
  async executeCase(caseId: string): Promise<ExecutionResult> {
    const steps = [
      stepDiagnose,
      stepSelectArm,
      stepCheckPolicy,
      stepExecute,
      stepMeasure
    ];
    
    const completedSteps: string[] = [];
    
    for (const step of steps) {
      try {
        const result = await this.retryWithBackoff(() => step.impl(context));
        context.results.set(step.id, result);
        completedSteps.push(step.id);
      } catch (error) {
        // Compensate completed steps in reverse order
        for (const stepId of completedSteps.reverse()) {
          const step = steps.find(s => s.id === stepId);
          if (step?.compensation) {
            await step.compensation(context);
          }
        }
        throw new ExecutionError(`Step ${step.name} failed`, error);
      }
    }
    
    return { caseId, status: "completed", results: context.results };
  }
}
```

**Tests:**
- Step succeeds on first try → no retries
- Step fails transiently (first call fails, second succeeds) → retries and proceeds
- Step fails permanently → compensations run in reverse order
- Compensation itself fails → error logged but execution continues

### Task 4: Wire orchestrator in `apps/engine`

**Files to modify:**
- `apps/engine/src/orchestrator.ts` (main agent loop)

**Orchestrator flow:**
```
signal (from detector)
  ↓
[Diagnose] → LLM + RAG (read-only tools)
  ↓
[Plan] → Thompson bandit arm selection
  ↓
[Policy Gate] → PolicyEngine evaluates rules
  ↓ (if PASS)
[Execute] → DurableExecutor runs steps
  ↓
[Measure] → Experiment feedback loop
  ↓
[Ledger] → Write case and actions to audit log
```

**Pseudo-code:**
```typescript
export async function orchestrateCase(signal: RiskSignal): Promise<RecoveryCase> {
  // Load or create case
  let case = await db.getOrCreateCase(signal);
  
  // Diagnose
  const diagnosis = await llmProvider.diagnose(signal);
  case.state = "diagnosing";
  await db.updateCase(case);
  
  // Plan (bandit)
  const arm = await bandit.selectArm([...possiblePlaybooks], signal.category);
  const playbook = await db.getPlaybook(arm);
  case.state = "planned";
  await db.updateCase(case);
  
  // Policy gate
  const policyContext = { case, diagnosis, playbook, estimatedRecoverable: signal.exposurePaise };
  const decisions = policyEngine.evaluate(policyContext);
  if (decisions.some(d => d === "BLOCK")) {
    case.state = "stopped";
    await db.updateCase(case);
    return case;
  }
  if (decisions.some(d => d === "DEFER")) {
    case.state = "deferred";
    await db.updateCase(case);
    return case; // Retry later
  }
  if (decisions.some(d => d === "NEEDS_APPROVAL")) {
    case.state = "awaiting_approval";
    await db.updateCase(case);
    return case; // Wait for human
  }
  
  // Execute
  case.state = "executing";
  await db.updateCase(case);
  
  const executor = new DurableExecutor();
  const executionResult = await executor.executeCase(case.id);
  
  // Check outcome
  if (executionResult.recovered > 0n) {
    case.state = "recovered";
    case.recoveredPaise = executionResult.recovered;
  } else {
    case.state = "failed";
  }
  await db.updateCase(case);
  
  // Log to audit ledger
  ledger.append({
    actor: "orchestrator",
    caseId: case.id,
    action: case.state,
    payload: { diagnosis, arm: playbook.id, decisions, result: executionResult }
  });
  
  return case;
}
```

### Task 5: Integration tests

**File:** `tests/integration/orchestrator-e2e.test.ts`

**Tests:**
- Seeded simulator event → detector signal → orchestrator loop → case recovered
- Mock LLM produces diagnosis → bandit selects arm → executor writes outcome
- Policy blocks high-cost action on low recovery → case stopped
- Ledger records all steps with tamper detection

---

## Self-Review Checklist

- [ ] LLM provider abstraction works with OpenAI (credentials) or Mock (offline)
- [ ] Razorpay client abstraction works with live API or in-memory fake
- [ ] Agent loop is read-only: LLM only proposes, never executes
- [ ] All LLM outputs are Zod-validated before use
- [ ] Executor retries on transient errors, compensates on permanent
- [ ] Razorpay fake produces realistic responses (same schema as live API)
- [ ] Orchestrator integrates all pieces (diagnose → plan → policy → execute)
- [ ] Case state transitions through state machine correctly
- [ ] Ledger records all steps, chain verifies clean
- [ ] E2E test: simulator → signal → orchestrator → case recovered
- [ ] All tests pass with `pnpm test`
- [ ] TypeScript strict: `pnpm typecheck`

---

## Commits

Pattern:
```
feat(llm): add provider abstraction and diagnose agent loop

Co-Authored-By: Claude <noreply@anthropic.com>
```

---

## Next: Plan 5

Once Plan 4 is verified (orchestrator completes cases, ledger is clean, Razorpay fake works), proceed to Plan 5: **Dashboard** (Days 11–12).
