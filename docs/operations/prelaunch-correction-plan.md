# Pre-launch correction plan

## Required before merge

1. Fix nullable MCP output contracts.
2. Add executable contract coverage for every public MCP tool.
3. Bind release compatibility to a database-owned schema marker.
4. Make OAuth authorization-code consumption atomic and rate limiting fail closed.
5. Make MCP idempotency recover from failed, expired, and abandoned entries.
6. Block access from deletion request submission and recover stale deletion jobs.
7. Move Stripe event processing behind a durable claim/retry ledger.
8. Rehearse migrations on an isolated production-like database.
9. Capture row reconciliation and RLS policy diffs.
10. Run GitHub Actions, deployed OAuth/tool acceptance, and populated-account QA.
11. Complete external provider configuration and qualified legal review.

No merge, production migration, or production deployment is authorized by this document.
