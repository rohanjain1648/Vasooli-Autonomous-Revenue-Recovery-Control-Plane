# ADR 0004: Append-only, hash-chained audit ledger

**Status:** Accepted

## Context

An agent that can touch real money needs an audit trail that is more than
"we logged it somewhere" — a log a compromised or buggy process could
silently edit is not evidence of anything. The brief explicitly calls for
"an audit trail," and the pitch's glass-box promise depends on being able
to show a reviewer a tamper-evident record, not just a database table.

## Decision

`packages/ledger`'s `Ledger` class is an append-only, hash-chained log:

```
hash_n = sha256(hash_{n-1} ‖ canonical_json({actor, caseId, action, payload, index, timestamp}))
```

`canonicalJson()` sorts object keys recursively before serializing, so the
same logical entry always hashes identically regardless of property
insertion order. `Ledger.verify()` recomputes the entire chain from the
genesis hash (64 zeros) and reports the first index where a stored hash
disagrees with the recomputed one — this is what both `GET /api/audit?
verify=true` and the dashboard's Audit page use, and the dashboard
additionally re-verifies independently in the browser via Web Crypto
(`apps/web/src/app/audit/page.tsx`) rather than only trusting the server's
word for it.

Every state transition, policy verdict, LLM diagnosis, and executor step
outcome in `orchestrateCase()` is appended as its own ledger entry
(`packages/orchestrator/src/orchestrator.ts`), so a case's full timeline
is reconstructable by filtering the ledger on `caseId`.

## Consequences

- `Ledger._tamperForTest()` exists specifically so the test suite can
  mutate a stored entry and assert `verify()` catches it
  (`packages/ledger/src/ledger.test.ts`) — the tamper-evidence property is
  itself under test, not just implemented and hoped for.
- The ledger is in-process memory in this build (see
  [0006](0006-in-memory-state-no-database.md)), so `verify()` protects
  against in-process mutation bugs and demonstrates the mechanism, but
  does not yet protect against a full process compromise with disk/memory
  access — a production version would need the chain persisted to
  append-only storage (or anchored externally) for that guarantee.
- Because hashing is canonical-JSON based, adding a new field to any
  logged payload is safe (old entries keep verifying), but reordering or
  renaming an *existing* field of an already-stored entry would look
  identical to tampering — the schema of what gets logged should be
  treated as append-only too.
