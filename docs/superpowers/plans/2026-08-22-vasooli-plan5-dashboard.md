# Vasooli Plan 5: Dashboard (Days 11–12)

> **Prerequisites:** Plans 2–4 complete (full orchestrator working end-to-end).  
> **Scope:** Next.js 15 frontend, real-time SSE updates, case timeline, approvals inbox, audit log viewer, money wall.  
> **Stack:** Next.js, React, TailwindCSS, shadcn/ui, Server-Sent Events (SSE).

---

## Overview

**Goal:** Build a glass-box dashboard that shows:
1. **Money Wall:** Live incremental ₹ recovered (with CI), gross vs. net, uplift significance
2. **Case Timeline:** Every case's journey (detected → diagnosing → planned → awaiting_approval/deferred/executing → recovered/failed/stopped)
3. **Approvals Inbox:** High-value or risky actions awaiting human sign-off
4. **Audit Log Viewer:** Tamper-evident ledger, hash chain validation
5. **Experimentation:** Arm allocation, treatment vs. holdout cohort comparison

All updates are real-time via SSE; no polling.

---

## Deliverables

### 1. **apps/web** (new Next.js 15 app)
- `pages/dashboard` — money wall, metrics
- `pages/cases` — case list, filtering (state, category, recovery status)
- `pages/case/[id]` — case detail, timeline view
- `pages/approvals` — approval queue for NEEDS_APPROVAL decisions
- `pages/audit` — tamper-evident ledger viewer, hash chain validator
- `pages/experiments` — cohort breakdown (treatment vs. holdout)

### 2. **Fastify API enhancements** (`apps/engine`)
- `GET /api/metrics` — current incremental ₹, CI, p-value, net recovery
- `GET /api/cases?state=executing&category=payment_failure` — filterable case list
- `GET /api/cases/:id` — case detail with all transitions
- `GET /api/approvals` — NEEDS_APPROVAL decisions pending
- `POST /api/approvals/:id/approve` — human approval submission
- `GET /api/audit?verify=true` — ledger with chain verification
- `GET /api/experiments` — experiment feedback (arm success rates)
- `GET /api/events` (SSE) — streaming updates: new cases, state transitions, approvals, measurements

### 3. **Real-time data flow**
- Orchestrator → case state change → SSE broadcast to dashboard
- Approval action → case state transition → SSE broadcast
- Measurement loop → incremental ₹ update → SSE broadcast

### 4. **Audit log viewer**
- Display all ledger entries (actor, action, timestamp, hash)
- Verify chain: walk entries, re-hash each, compare to stored hash
- Highlight any break in chain (red banner: "AUDIT LOG TAMPERED")
- Export ledger as JSON

### 5. **Tests**
- Money wall metrics match database state
- Case list filters correctly by state/category
- Approval action transitions case and broadcasts SSE
- Audit viewer detects tampered entry (hash mismatch)
- E2E: UI shows case, user approves, case transitions, UI updates in real-time

---

## Implementation Tasks

### Task 1: Set up `apps/web` scaffolding

**Files:**
- `apps/web/package.json` (Next.js 15, React 19, TailwindCSS, shadcn/ui)
- `apps/web/tsconfig.json`
- `apps/web/next.config.js`
- `apps/web/tailwind.config.ts`
- `apps/web/src/app/layout.tsx` (root layout with header/nav)
- `apps/web/src/app/page.tsx` (landing redirect to /dashboard)
- `apps/web/.env.example`

**Key dependency versions:**
- Next.js 15.x
- React 19.x
- TailwindCSS 4.x
- shadcn/ui latest
- SWR or TanStack Query for data fetching

### Task 2: Implement Money Wall (`dashboard` page)

**File:** `apps/web/src/app/dashboard/page.tsx`

**Displays:**
- **Headline metric:** "₹2.9L incremental (95% CI ±₹31k, p=0.003)"
- **Subheader:** Gross ₹4.2L · Treatment ₹4.1L (n=1200) vs. Holdout ₹1.4L (n=1200)
- **Breakdown cards:**
  - Cases detected
  - Cases recovered
  - Cases blocked/deferred
  - Avg recovery per case
  - Policy blocks vs. execution failures
- **Gauge chart:** Incremental uplift with CI bands
- **Timeline:** Last 24h case state transitions

**Real-time updates:** SSE subscription to `/api/events`, re-render on metric change

**Code sketch:**
```typescript
// apps/web/src/components/MoneyWall.tsx
export function MoneyWall() {
  const [metrics, setMetrics] = useState<MetricsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Initial fetch
    fetch("/api/metrics")
      .then(r => r.json())
      .then(m => { setMetrics(m); setLoading(false); });
    
    // SSE subscription
    const sse = new EventSource("/api/events?stream=metrics");
    sse.onmessage = (e) => {
      const updated = JSON.parse(e.data);
      setMetrics(updated);
    };
    
    return () => sse.close();
  }, []);

  if (loading) return <Skeleton />;
  
  return (
    <div className="space-y-6">
      <Card className="border-2 border-green-500">
        <CardHeader>
          <CardTitle className="text-4xl">
            ₹{metrics.incrementalPaise.toLocaleString()}
          </CardTitle>
          <CardDescription>
            95% CI ±₹{metrics.ciWidthPaise.toLocaleString()}, p={metrics.pValue.toFixed(3)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <Stat label="Gross" value={`₹${metrics.grossPaise.toLocaleString()}`} />
            <Stat label="Treatment" value={`₹${metrics.treatmentPaise.toLocaleString()} (n=${metrics.treatmentN})`} />
            <Stat label="Holdout" value={`₹${metrics.holdoutPaise.toLocaleString()} (n=${metrics.holdoutN})`} />
          </div>
          <UpliftGauge {...metrics} />
        </CardContent>
      </Card>
      
      <div className="grid grid-cols-2 gap-4">
        <MetricCard title="Cases Detected" value={metrics.detected} />
        <MetricCard title="Cases Recovered" value={metrics.recovered} trend={metrics.recoveredTrend} />
        {/* ... more cards */}
      </div>
    </div>
  );
}
```

### Task 3: Implement case list & detail pages

**Files:**
- `apps/web/src/app/cases/page.tsx` (list with filters)
- `apps/web/src/app/cases/[id]/page.tsx` (detail with timeline)

**Case List:**
- Table: ID, customer, amount, category, state, created, updated
- Filters: state (dropdown), category (dropdown), recovery (positive/negative)
- Sorting: by update time, amount, state
- Link to detail page

**Case Detail:**
- Case header: ID, amount, category, current state, arm group
- Timeline: vertical list of state transitions with timestamps
  - detected → diagnosing (LLM diagnosis output shown)
  - diagnosing → planned (playbook arm selection)
  - planned → awaiting_approval (policy decision)
  - awaiting_approval → executing (executor steps)
  - executing → recovered/failed (recovery amount, compensation)
- Action button: if state=awaiting_approval and user is approver, show "Approve" button

**Code sketch:**
```typescript
// apps/web/src/app/cases/[id]/page.tsx
export default async function CaseDetail({ params }: { params: { id: string } }) {
  const caseData = await fetch(`/api/cases/${params.id}`).then(r => r.json());
  
  return (
    <div className="space-y-6">
      <CaseHeader case={caseData} />
      <CaseTimeline case={caseData} />
      {caseData.state === "awaiting_approval" && <ApprovalPanel caseId={caseData.id} />}
    </div>
  );
}

function CaseTimeline({ case: RecoveryCase }) {
  return (
    <div className="space-y-4">
      {case.transitions.map((t, i) => (
        <TimelineItem
          key={i}
          state={t.toState}
          timestamp={t.at}
          metadata={t.metadata}
          isLatest={i === case.transitions.length - 1}
        />
      ))}
    </div>
  );
}
```

### Task 4: Implement approvals inbox

**File:** `apps/web/src/app/approvals/page.tsx`

**Displays:**
- List of all NEEDS_APPROVAL cases
- For each: amount, reason (policy rule), playbook arm, recommendation
- "Approve" and "Reject" buttons
- Upon approve: call POST /api/approvals/:id/approve, SSE broadcasts update, case transitions

**Code sketch:**
```typescript
export function ApprovalsPage() {
  const [pending, setPending] = useState<ApprovalDecision[]>([]);
  
  useEffect(() => {
    fetch("/api/approvals").then(r => r.json()).then(setPending);
    
    const sse = new EventSource("/api/events?stream=approvals");
    sse.onmessage = (e) => {
      const { action, approval } = JSON.parse(e.data);
      if (action === "approved" || action === "rejected") {
        setPending(p => p.filter(a => a.id !== approval.id));
      }
    };
    return () => sse.close();
  }, []);
  
  async function handleApprove(approvalId: string) {
    await fetch(`/api/approvals/${approvalId}/approve`, { method: "POST" });
    // SSE will update the list
  }
  
  return (
    <div className="space-y-4">
      {pending.map(a => (
        <ApprovalCard key={a.id} approval={a} onApprove={handleApprove} />
      ))}
    </div>
  );
}
```

### Task 5: Implement audit log viewer

**File:** `apps/web/src/app/audit/page.tsx`

**Displays:**
- Timeline of all ledger entries
- Each entry: index, timestamp, actor, action, hash, prevHash
- Verify button: re-hashes chain, highlights breaks in red
- Export button: downloads ledger as JSON

**Code sketch:**
```typescript
export function AuditPage() {
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [chainValid, setChainValid] = useState(true);
  
  useEffect(() => {
    fetch("/api/audit?verify=true")
      .then(r => r.json())
      .then(data => {
        setLedger(data.entries);
        setChainValid(data.valid);
      });
  }, []);
  
  function exportLedger() {
    const json = JSON.stringify(ledger, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "audit-ledger.json";
    a.click();
  }
  
  return (
    <div className="space-y-6">
      {!chainValid && <Alert severity="error">AUDIT LOG TAMPERED: Hash mismatch detected</Alert>}
      <Button onClick={exportLedger}>Export Ledger</Button>
      <LedgerTimeline entries={ledger} />
    </div>
  );
}
```

### Task 6: Implement experiments page (cohort breakdown)

**File:** `apps/web/src/app/experiments/page.tsx`

**Displays:**
- Treatment arm: count, success rate, avg recovery, samples
- Holdout arm: same metrics
- Comparison: uplift %, significance (p-value), confidence interval
- Table: case samples from each arm

**Code sketch:**
```typescript
export function ExperimentsPage() {
  const [experiment, setExperiment] = useState<ExperimentSnapshot | null>(null);
  
  useEffect(() => {
    fetch("/api/experiments").then(r => r.json()).then(setExperiment);
  }, []);
  
  if (!experiment) return <Skeleton />;
  
  return (
    <div className="space-y-6">
      <CohortComparison treatment={experiment.treatment} holdout={experiment.holdout} />
      <CohortTable arm="treatment" cases={experiment.treatmentCases} />
      <CohortTable arm="holdout" cases={experiment.holdoutCases} />
    </div>
  );
}
```

### Task 7: Enhance Fastify API (`apps/engine`)

**New endpoints:**
```typescript
// src/routes/metrics.ts
export const metricsRoutes = async (fastify: FastifyInstance) => {
  fastify.get("/api/metrics", async (req, reply) => {
    const metrics = await getMetricsSnapshot();
    return metrics;
  });
};

// src/routes/cases.ts
fastify.get("/api/cases", async (req, reply) => {
  const { state, category, limit = 20 } = req.query as any;
  const cases = await db.getCases({ state, category, limit });
  return cases;
});

fastify.get("/api/cases/:id", async (req, reply) => {
  const { id } = req.params as { id: string };
  const caseData = await db.getCaseWithTransitions(id);
  return caseData;
});

// src/routes/approvals.ts
fastify.get("/api/approvals", async (req, reply) => {
  const pending = await db.getPendingApprovals();
  return pending;
});

fastify.post("/api/approvals/:id/approve", async (req, reply) => {
  const { id } = req.params as { id: string };
  await approvalService.approve(id, req.user.id);
  return { ok: true };
});

// src/routes/audit.ts
fastify.get("/api/audit", async (req, reply) => {
  const { verify } = req.query as any;
  const entries = ledger.all();
  const valid = verify ? ledger.verify().valid : undefined;
  return { entries, valid };
});

// src/routes/events.ts (SSE)
fastify.get("/api/events", async (req, reply) => {
  req.socket.write("HTTP/1.1 200 OK\r\n");
  req.socket.write("Content-Type: text/event-stream\r\n");
  req.socket.write("Cache-Control: no-cache\r\n");
  req.socket.write("Connection: keep-alive\r\n\r\n");
  
  const unsub = eventBus.subscribe("*", (event) => {
    req.socket.write(`data: ${JSON.stringify(event)}\n\n`);
  });
  
  req.socket.on("close", unsub);
});
```

### Task 8: Integration test

**File:** `tests/e2e/dashboard-approval-flow.test.ts`

**Test:**
1. Case arrives with NEEDS_APPROVAL decision
2. Dashboard loads, shows case in approvals inbox
3. User approves via UI
4. Case state transitions to executing
5. Dashboard updates in real-time via SSE
6. Case completes, incremental ₹ updates on money wall

---

## Self-Review Checklist

- [ ] Money wall displays headline incremental ₹, CI, p-value
- [ ] Case list filters by state, category, sorts correctly
- [ ] Case detail shows full timeline with transitions
- [ ] Approval action transitions case and broadcasts SSE
- [ ] Audit viewer displays ledger, detects tampered entry
- [ ] Experiments page shows arm comparison and uplift
- [ ] All updates via SSE (no polling)
- [ ] API endpoints are secured (authentication, authorization)
- [ ] UI is responsive (mobile-friendly via TailwindCSS)
- [ ] E2E test covers approval flow with real-time updates
- [ ] All tests pass: `pnpm test`
- [ ] TypeScript strict: `pnpm typecheck`

---

## Commits

Pattern:
```
feat(web): add Next.js dashboard with real-time SSE updates

Co-Authored-By: Claude <noreply@anthropic.com>
```

---

## Next: Final Steps (Days 13–15)

After Plan 5 is complete:
1. **Day 13:** Hinglish voice script + TTS render; seeded `pnpm demo` script
2. **Day 14:** README, architecture diagram, ADRs, PITCH.md
3. **Day 15:** Rehearse 5-minute pitch and architecture walkthrough

---

## Notes

- SSE is simpler than WebSockets for this use case (server → client only).
- shadcn/ui provides pre-built accessible components (Card, Button, Table, etc.).
- TailwindCSS ensures consistent styling across pages.
- Audit log viewer must verify the chain locally (re-hash in JavaScript).
- All monetary values displayed in ₹ with proper formatting (1L = 1,00,000).
