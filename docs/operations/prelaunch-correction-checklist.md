# Pre-launch correction checklist

- [ ] MCP nullable output contracts corrected
- [ ] All 35 public tools covered by executable output-contract tests
- [ ] Database-owned schema compatibility marker implemented
- [ ] OAuth authorization-code consumption atomic
- [ ] OAuth rate limiting fails closed
- [ ] MCP idempotency retries recover safely
- [ ] Deletion-pending access blocked
- [ ] Stale deletion jobs recoverable
- [ ] Provider cleanup adapters are explicit and testable
- [ ] Stripe events claimed and retried durably
- [ ] Nine migrations rehearsed outside production
- [ ] Row reconciliation captured
- [ ] RLS policy diff captured
- [ ] Draft PR quality workflow green
- [ ] Real ChatGPT OAuth/tool acceptance passed
- [ ] Populated reviewer-account QA passed
- [ ] External provider configuration complete
- [ ] Qualified legal review complete

Merge and production migration remain prohibited until all launch gates are satisfied.
