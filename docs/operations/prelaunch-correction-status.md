# Pre-launch correction status

This branch remains **NO-GO** for merge, production migration, or public launch.

The current correction pass covers:

- MCP output-contract correctness and full public-tool contract coverage
- database-owned schema compatibility evidence
- OAuth replay/rate-limit correctness
- MCP mutation idempotency recovery
- account-deletion queue recovery and provider cleanup semantics
- durable Stripe event retry processing
- migration reconciliation and RLS verification evidence

Production database migrations and production deployment are explicitly out of scope for this branch pass. A development database rehearsal is required before production use.

## External blockers

- Supabase database branching is unavailable on the current plan. The attempted isolated branch creation was rejected because branching requires Pro or above.
- Real ChatGPT OAuth acceptance requires a deployed review environment and the ChatGPT connector callback/client metadata configuration.
- Final German legal/privacy approval must be completed by qualified counsel; repository text and tests cannot constitute legal approval.
