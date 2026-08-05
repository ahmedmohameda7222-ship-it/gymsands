# Plaivra Decisions

This is an append-only decision log. Do not rewrite or delete an approved historical entry. Supersede it with a new decision when direction changes.

## D-001 — Leadership model

- Date: 2026-08-03
- Status: Approved
- Decision: Plaivra is led by the Product & Engineering Lead; implementation engineers execute approved direction rather than choose product or architecture scope.
- Reason: Product, UX, architecture, and delivery direction require one accountable authority.
- Consequences: Implementers execute bounded specifications and report evidence; scope or architecture changes require Lead approval.
- Supersedes / Superseded by: None.

## D-002 — Final public launch

- Date: 2026-08-03
- Status: Approved
- Decision: No public beta. Internal validation, release candidate, security/load/device testing, and production rehearsal remain mandatory.
- Reason: Plaivra will launch publicly only after controlled internal readiness work is complete.
- Consequences: Internal validation is required, but it is not marketed or operated as a public beta.
- Supersedes / Superseded by: None.

## D-003 — Repository control authority

- Date: 2026-08-03
- Status: Approved
- Decision: Current project state and direction live in `docs/control/`, not in chat memory or historical PR descriptions.
- Reason: Future work requires a concise, current, repository-owned authority.
- Consequences: Material state, roadmap, architecture-authority, delivery-rule, and decision changes must update the control documents in the same PR.
- Supersedes / Superseded by: None.

## D-004 — Stabilization before feature expansion

- Date: 2026-08-03
- Status: Approved
- Decision: Complete PCS-1 through PCS-5 before ordinary new-feature implementation resumes.
- Reason: Platform and delivery foundations must be stabilized before further feature expansion.
- Consequences: New product features remain outside implementation unless the Lead declares an urgent blocker.
- Supersedes / Superseded by: None.

## D-005 — Long-term engineering

- Date: 2026-08-03
- Status: Approved
- Decision: Fixes must address the underlying product or architecture problem. Test-only bypasses and temporary fixes are not accepted as closure.
- Reason: Temporary closure increases long-term reliability and maintenance risk.
- Consequences: Corrections must preserve intended tests and address root causes unless a separately approved exception exists.
- Supersedes / Superseded by: None.

## D-006 — Testing strategy

- Date: 2026-08-03
- Status: Approved
- Decision: Daily validation must be risk-based and fast. Full release validation is separate from the ordinary development loop.
- Reason: Daily development requires rapid evidence without running the complete release matrix for every bounded change.
- Consequences: Targeted validation protects changed risk; PCS-4 will define the final CI operating model.
- Supersedes / Superseded by: None.

## D-007 — Merge policy

- Date: 2026-08-03
- Status: Approved
- Decision: Implementation PRs require Lead QA/QC, Ahmed’s explicit approval, and squash merge.
- Reason: Product and technical approval must precede integration into the release branch.
- Consequences: Implementers do not merge or mark work complete without the required approvals.
- Supersedes / Superseded by: None.

## D-008 — Idea handling

- Date: 2026-08-03
- Status: Approved
- Decision: New feature ideas enter product review and classification before implementation.
- Reason: New ideas must be evaluated against Plaivra 1.0 scope, sequencing, and product value.
- Consequences: Unclassified ideas do not enter implementation automatically.
- Supersedes / Superseded by: None.

## D-009 — Private application bootstrap authority

- Date: 2026-08-03
- Status: Approved
- Decision: Authenticated private startup uses one owner-scoped `get_private_app_bootstrap_v1()` RPC and one AuthProvider-managed, memory-only, user-scoped bootstrap authority. Route guards consume that authority and perform no account-startup data fetches.
- Reason: Separate profile, consent, eligibility, onboarding, and settings reads duplicated requests and allowed competing client startup authorities.
- Consequences: Initial private startup facts update atomically, same-user requests share ready or in-flight memory state, user changes invalidate prior authority, and ProtectedRoute remains a deterministic no-fetch gate.
- Supersedes / Superseded by: None.

## D-010 — Workout History request and navigation authority

- Date: 2026-08-03
- Status: Approved
- Decision: Workout History committed list-query state is owned by one canonical URL representation and one canonical owner/query key. One first-page request may be in flight per owner/query; presentation-only navigation does not refetch, cursor pagination remains independent, and normal browser list/detail requests consume the AuthProvider session token without per-request session lookup.
- Reason: Continuously synchronized React and URL authorities recreated equivalent query objects and repeated first-page requests, while the History client redundantly resolved the Supabase session for each request.
- Consequences: Draft search and custom dates remain local until committed; selected-item and filter-panel state are excluded from request identity; equivalent queries reuse ready or in-flight work; user changes invalidate prior publication; pagination cannot restart the first page; and normal History UI callers pass the latest AuthProvider access token explicitly.
- Supersedes / Superseded by: None.

## D-011 — Today authenticated server projection

- Date: 2026-08-03
- Status: Approved
- Decision: Today uses one versioned authenticated browser projection keyed by one owner/date/timezone identity. The browser consumes the AuthProvider session token, the server derives the owner through `requireUser(request)`, bounded domain readers use its RLS-bound Supabase client, and the minimum-data response preserves safe partial-domain envelopes.
- Reason: Independent Today browser loaders created broad browser-to-Supabase fan-out, repeated authentication/network overhead, multiple competing publication authorities, and excessive client orchestration.
- Consequences: One Today operation produces one browser data request; direct initial browser reads may not return; server query count remains constant with item cardinality; existing domain mutation authorities remain canonical; no service role, giant cross-domain SQL projection, dual loading path, new fact model, or persistent browser projection cache is permitted; and Production performance measurement remains deferred to PCS-3C.
- Supersedes / Superseded by: None.

## D-012 — PCS-3 Production request measurement authority

- Date: 2026-08-04
- Status: Approved
- Decision: PCS-3 Production request evidence is generated by one durable read-only Playwright harness using approved populated and empty synthetic accounts, an exact deployed-identity gate, bounded post-warmup samples, hard request-count invariants, and sanitized JSON/Markdown artifacts.
- Reason: PCS-3A and PCS-3B automated architecture evidence does not prove exact deployed browser request counts, response sizes, route timings, failures, headers, or interaction behavior.
- Consequences: Exact commit and migration identity are mandatory before measurement; browser and server durations remain distinct; request-count invariants are hard gates; no latency threshold is approved yet; credentials, payloads, tokens, cookies, browser storage, query values, user IDs, opaque IDs, and raw request IDs are forbidden from evidence; Production measurement occurs only after merge; and PCS-3 requires a later PCS-3C.2 Production run and docs-only reconciliation before closure.
- Supersedes / Superseded by: None.

## D-013 — PCS-3 Production closure baseline

- Date: 2026-08-05
- Status: Approved
- Decision: PCS-3 is closed using canonical run `30963068373` against exact Production deployment `4dfbacdf7cb6d45c1f81bcc442f10d18ba992c0b`; the recorded synthetic-fixture results are the repository baseline, not a general user-latency SLA or final launch budget.
- Reason: PCS-3A and PCS-3B required exact deployed browser evidence before request architecture could be considered complete.
- Consequences: Today preserves one projection and zero direct initial Supabase reads; Workout History preserves one initial first page and zero initial cursor requests; future regressions use the durable harness; latency budgets require a later decision; PCS-4 becomes next.
- Supersedes / Superseded by: Completes the reconciliation required by D-012; does not supersede D-012.

## D-014 — PCS-4 closure and provider-control deferral

- Date: 2026-08-05
- Status: Approved
- Decision: PCS-4 is closed with the merged PCS-4A path-scoped Draft PR validation authority. Repository-level branch protection and provider-required checks are deferred while Plaivra remains a single-owner repository without a delivery team.
- Reason: PCS-4A solves the active CI cost and validation-authority problem. Additional provider controls add operational friction without enough current value for a repository operated only by Ahmed.
- Consequences: PR Quality, canonical Quality, Exact Release, release preflight, Lead QA/QC, Ahmed approval, and squash merge remain the repository delivery authorities; the Phase A compatibility workflow remains unchanged; provider controls must be reconsidered before collaborators, delegated merge authority, or materially higher repository-access risk are introduced; PCS-5 becomes next.
- Supersedes / Superseded by: Completes the PCS-4 direction anticipated by D-006; does not supersede D-006 or D-007.

## D-015 — Exact main-to-Production convergence before later Production controls

- Date: 2026-08-05
- Status: Approved
- Decision: PCS-5A establishes a repository-owned, read-only authority that automatically proves the exact checked-out `main` commit is live and release-ready on the canonical Production origin before alert routing, provider procurement, or backup/restore closure is implemented.
- Reason: Later Production controls require a trustworthy release identity. An hourly HTTP-success check can remain green while Production serves a healthy but stale commit, so exact `main` → Production convergence must be established first.
- Consequences: Every `main` push receives a bounded exact-commit convergence window; hourly public continuity checks remain; `/api/health`, `/api/version`, schema identity, migration identity, ledger reconciliation, and public legal/auth surfaces fail closed into sanitized evidence; the authority performs no deployment, provider mutation, authenticated smoke, database write, or Production mutation; alert routing and backup/restore readiness remain later PCS-5 work.
- Supersedes / Superseded by: Extends the release-identity direction preserved by D-007 and the Production-evidence discipline established by D-012; supersedes neither.

## Future entry format

Every future entry must include:

- ID
- Date
- Status
- Decision
- Reason
- Consequences
- Supersedes / Superseded by, when applicable
