# Architecture Decision Records

Each ADR documents one decision worth explaining on its own — why it was
made, what it costs, what it would take to change. Numbered in roughly the
order the decisions became load-bearing, not necessarily chronological.

| ADR | Decision |
|---|---|
| [0001](0001-measure-incremental-not-gross.md) | Measure incremental recovery, not gross |
| [0002](0002-llm-read-only-deterministic-gate.md) | The LLM is read-only; a deterministic policy gate approves every action |
| [0003](0003-money-as-bigint-paise.md) | Money is always `bigint` paise, never a float |
| [0004](0004-hash-chained-audit-ledger.md) | Append-only, hash-chained audit ledger |
| [0005](0005-offline-first-provider-abstraction.md) | Offline-first provider abstraction for every paid dependency |
| [0006](0006-in-memory-state-no-database.md) | In-memory engine state instead of Postgres + Redis |
| [0007](0007-hand-rolled-statistics-no-black-box.md) | Hand-rolled statistics, no black-box stats library |
