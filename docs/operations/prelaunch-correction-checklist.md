# Pre-launch correction checklist

## Completed on this branch

- [x] MCP nullable output contracts corrected
- [x] All 35 public tools covered by executable output-contract tests
- [x] Database-owned schema compatibility marker implemented
- [x] OAuth authorization-code consumption atomic
- [x] OAuth rate limiting fails closed
- [x] MCP idempotency fails safe for replay, conflict, active work, and uncertain completion
- [x] Deletion-pending access blocked
- [x] Stale deletion jobs recoverable
- [x] Stripe events claimed and retried durably
- [x] Production baseline row counts captured read-only
- [x] Production baseline RLS/grant fingerprints captured read-only
- [x] Draft PR quality workflow green on the verified code head
- [x] Vercel preview build accepted after daily-cron correction

## Implemented but incomplete

- [ ] Concrete provider-deletion adapters implemented for every supported external integration
  - Current state: unsupported integrations fail safe after account access is disabled; production currently has zero `user_integrations` rows.
- [ ] Full pending migration chain rehearsed outside production
  - Current state: eleven pending pre-launch migrations; Supabase branching is unavailable on the current plan.
- [ ] Post-migration row reconciliation captured
  - Current state: verification SQL and production baseline exist; post-migration evidence is blocked.
- [ ] Post-migration RLS/grant policy diff captured
  - Current state: verification SQL and production fingerprints exist; post-migration evidence is blocked.

## External acceptance still required

- [ ] Real ChatGPT OAuth/tool acceptance passed
- [ ] Populated reviewer-account QA passed
- [ ] Production provider configuration and secrets complete
- [ ] Supabase leaked-password protection enabled
- [ ] Qualified German legal/privacy review complete

Merge and production migration remain prohibited until all launch gates are satisfied.
