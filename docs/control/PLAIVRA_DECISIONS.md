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

## Future entry format

Every future entry must include:

- ID
- Date
- Status
- Decision
- Reason
- Consequences
- Supersedes / Superseded by, when applicable
