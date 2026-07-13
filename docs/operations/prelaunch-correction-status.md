# Pre-launch correction status

This branch remains **NO-GO** for merge, production migration, or public launch.

## Implemented and CI-verified

- Nullable MCP context outputs are omitted safely and validated against closed output schemas.
- All 35 public MCP tools have executable output-contract coverage.
- Release compatibility is bound to a database-owned schema marker and fails closed when the marker is absent or mismatched.
- OAuth rate limiting fails closed when its database guard is unavailable.
- OAuth authorization codes are consumed atomically only after client, redirect, PKCE, expiry, and resource bindings match.
- MCP mutation idempotency uses a database claim protocol; uncertain completion requires record review instead of unsafe automatic re-execution.
- Account access is blocked from deletion request submission, stale deletion jobs are recoverable, and provider cleanup cannot precede account disablement.
- Stripe events use a durable claim/retry ledger. Duplicate deliveries can reclaim retryable work instead of being discarded.
- The billing retry safety sweep is compatible with the Vercel Hobby daily-cron restriction.
- GitHub Actions verifies integrity, lint, dependency audit, migration ledger, typecheck, unit tests, integration tests, production build, and release manifest.

## Implemented but not externally verified

- Eleven pending pre-launch migrations exist in the repository. They have not been applied to production.
- Production baseline row counts and RLS/grant fingerprints have been captured read-only.
- Reconciliation and policy-diff SQL is present, but post-migration evidence cannot exist until the full chain runs on an isolated production-like database.
- A deployed ChatGPT tool-acceptance harness exists, but no compatible review database/access token is currently available.
- Provider cleanup fails safe when unsupported `user_integrations` exist, but concrete external-provider deletion adapters are not implemented. Production currently has no `user_integrations` rows.

## External blockers

- Supabase database branching is unavailable on the current plan. The attempted isolated branch creation was rejected because branching requires Pro or above. Production was not used as a substitute.
- The preview deployment builds successfully, but it is intentionally incompatible with the current production schema until the pending migration chain is rehearsed and applied through an approved release.
- Real ChatGPT OAuth/tool acceptance requires a compatible deployed review environment, ChatGPT callback/client metadata, and an issued review access token.
- Populated reviewer-account QA requires a compatible deployed database and an authorized reviewer session.
- Stripe, Resend, cron, retention, privacy-notification, OAuth, and app-domain production variables still require owner-controlled platform configuration and secret rotation.
- Supabase leaked-password protection remains disabled and requires a Supabase Auth configuration change.
- Final German legal/privacy approval must be completed by qualified counsel; repository text and automated tests cannot constitute legal approval.

Production database changes, merge, and public release remain prohibited until the external gates are complete.
