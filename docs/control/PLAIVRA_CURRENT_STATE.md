# Plaivra Current State

## Last audited runtime baseline

- Last audited application/runtime baseline before PCS-1:
  `main@525982e33920d2a94a15b875993850a4877aa8a5`
- At the time of the audit, Production reported the same commit and `/api/version` returned HTTP 200.
- PCS-1 changed documentation and project governance only; it did not change application runtime behavior.
- Exact current Git and Production identities must be verified from GitHub `main` and Production `/api/version`. Do not infer them from this historical audit snapshot.

## Compatibility state verified during the PCS-1 audit

| Field | Value |
|---|---|
| schemaCompatibilityVersion | `2` |
| expectedDatabaseMigrationVersion | `20260724232734` |
| databaseMigrationVersion | `20260724232734` |
| latest physical Production migration | `20260802114733` |
| migrationLedgerReconciliationState | `reconciled` |
| pendingMigrationCount | `0` |
| schemaAppliedUntrackedCount | `0` |
| unresolvedMigrationCount | `0` |
| migrationVersionCompatible | `true` |
| migrationLedgerReconciled | `true` |
| releaseReady | `true` |

These values describe the verified audit baseline. Any later runtime, migration, or release change must update this document in the same approved change.

## PCS-2 Production migration reconciliation

| Field | Verified value |
|---|---|
| Production project | `bkwezjxvapaeasfvlhvv` |
| immutable repository migration | `20260803152000_private_app_bootstrap_v1.sql` |
| generated Production identity | `20260803173755_private_app_bootstrap_v1` |
| Production migration count | `86` |
| applied exactly once | `true` |
| latest physical Production migration | `20260803173755_private_app_bootstrap_v1` |
| ledger classification | `applied_version_alias` |
| pendingMigrationCount | `0` |
| schemaAppliedUntrackedCount | `0` |
| unresolvedMigrationCount | `0` |
| migrationLedgerReconciliationState | `reconciled` |
| released compatibility marker | `20260724232734` |
| application deployment accompanied migration application | `false` |

The PCS-2 migration application did not deploy application code and did not promote the compatibility marker. Application deployment occurred later, after the approved squash merge.

## PCS-2 Production runtime closure

| Field | Verified value |
|---|---|
| approved PR head | `99c675692d1411c8296d6817a983e379d8c65a36` |
| squash merge / current Production commit at closure | `92d936bc513af83fff41913477a8148a9ab5b845` |
| Vercel deployment | `dpl_DbSrbwJ98HiuZTJQFW7G3hVtkVZy` |
| deployment target | `production` |
| deployment state | `READY` |
| build timestamp | `2026-08-03T18:07:46.883Z` |
| Production `/api/version` status | `200` |
| schemaCompatibilityVersion | `2` |
| expectedDatabaseMigrationVersion | `20260724232734` |
| databaseMigrationVersion | `20260724232734` |
| migrationLedgerReconciliationState | `reconciled` |
| pendingMigrationCount | `0` |
| schemaAppliedUntrackedCount | `0` |
| unresolvedMigrationCount | `0` |
| migrationVersionCompatible | `true` |
| migrationLedgerReconciled | `true` |
| releaseReady | `true` |
| schemaCompatible | `true` |
| Production login route | `200` |
| compute region | `fra1` |
| runtime-error clusters during closure verification | `0` |

PCS-2 is merged, deployed, Production-verified, and closed. The deployed application commit matched `main` at closure, the migration ledger was reconciled, the compatibility marker remained unchanged, and no post-deployment runtime error cluster was detected during the closure verification window.

## PCS-3 request architecture

### PCS-3A Workout History request stability

PCS-3A was squash-merged into `main` as:

```text
cf6e86d9b81c0b1cfb9503bcb46e5b1355d39a72
```

PCS-3A is merged and deployed. It establishes canonical URL/list-query request identity, same-key first-page coordination, independent cursor authority, and explicit AuthProvider-token consumption for normal Workout History list, detail, repair, and Progress History reads. Production request-count evidence remains intentionally deferred to PCS-3C.2.

### PCS-3B Today authenticated server projection

PCS-3B was squash-merged and deployed as:

```text
517e37ccd7252e040c652da72e155b3dcb5d5bda
```

PCS-3B replaces the historical Today browser-to-Supabase read fan-out with one authenticated versioned server projection keyed by owner/date/timezone. The route derives identity from `requireUser(request)`, uses the authenticated RLS-bound Supabase client, returns minimum-data partial-domain envelopes, and preserves existing domain mutation authorities and Today UI behavior.

Immediate PCS-3B runtime health was verified:

| Field | Verified value |
|---|---|
| Production deployment | `dpl_GvV3sESWw9s9yDmozb5DBkUX9aRD` |
| deployed commit | `517e37ccd7252e040c652da72e155b3dcb5d5bda` |
| deployment state | `READY` |
| `/api/version` | HTTP `200` |
| releaseReady | `true` |
| schemaCompatible | `true` |
| pending migrations | `0` |
| untracked applications | `0` |
| unresolved migrations | `0` |
| unauthenticated Today route | safe HTTP `401` |
| Today contract/privacy/correlation headers | present |
| immediate runtime-error cluster | none observed |

At PCS-3B closure, these facts verified deployment identity and immediate runtime health only; request counts, response sizes, durations, and browser-visible failure evidence remained deferred. PCS-3C.2 has now recorded and reconciled that Production evidence below.

### PCS-3C Production measurement and closure

PCS-3C.1 was merged through PR #127 as `63ca8ec2bf8e430b7e8ca87befccb6ff2a093b5c`. The bounded first-party timing-header correction was validated and squash-merged through PR #128 as `4dfbacdf7cb6d45c1f81bcc442f10d18ba992c0b`.

Canonical PCS-3C.2 Production measurement run `30963068373` passed against that exact deployment using both approved synthetic fixtures, `2` warmups, and `20` measured samples per account and route. Today preserved one projection and zero direct Supabase reads; Workout History preserved one first page and zero initial cursor requests. All `80` measured API responses were HTTP `200`, and all browser/server failure, privacy, and runtime-error gates passed.

The complete identity, hashes, per-account and combined p50/p95 results, evidence-safety review, and closure verdict are recorded in [`docs/performance/pcs3-production-closure.md`](../performance/pcs3-production-closure.md). The figures are a timestamped synthetic-fixture baseline, not a general user-latency SLA or final launch budget.

PCS-3 is merged, deployed, Production-measured, reconciled, and closed.

## PCS-4 CI operating model

PCS-4 is in progress. PCS-4A is the current implementation candidate and establishes the automatic path-scoped Draft PR validation authority while preserving canonical phase-close Quality, Exact Release, release preflight, deployment, Production verification, and provider-control boundaries. The operating model candidate is documented in [`docs/ci/pcs4-ci-operating-model.md`](../ci/pcs4-ci-operating-model.md).

PCS-4A is not closed by this implementation PR. Provider required-check verification and later PCS-4 closure remain separate Lead-authorized work.

## Current program

- PCS-1 Repository Control Plane — complete.
- PCS-2 Private App Bootstrap — complete and Production-verified.
- PCS-3 Request Architecture — complete, Production-measured, and closed.
- PCS-4 CI Operating Model — in progress; PCS-4A is the current implementation candidate.
- PCS-5 Production Foundation — planned.

## Feature maturity

| Capability | Classification | Confirmed note |
|---|---|---|
| Authentication / account / onboarding | Functional | Private startup converged through the PCS-2 bootstrap authority |
| Workouts plans and execution | Strong | — |
| Active Workout offline and multi-device | Strong | — |
| Workout History | Strong | PCS-3 request stability and canonical Production measurement are complete; the recorded baseline is not a launch SLA |
| Muscle Intelligence and Heat Maps | Strong | Strong foundation |
| Today | Functional | PCS-3B projection and Production measurement are complete; initial direct browser-to-Supabase reads measured zero |
| Nutrition and food logging | Functional | Transactional-convergence debt |
| Meal planning | Functional | — |
| Hydration | Functional | — |
| Progress and body measurements | Functional | — |
| Progress photos | Functional | Delete-compensation debt |
| Wellness, sleep, habits, supplements | Functional | Fragmented product presentation |
| Daily Tasks | Partial | Product relationship with Today is unresolved |
| My Recipes | Partial | Foundation exists; standalone product experience is not implemented |
| Notifications | Scaffold | Preferences exist but no delivery engine |
| PDF reports | Partial | Grocery PDF exists; general reporting does not |
| Activity Catalog external service | Scaffold | Inactive; current provider is legacy |
| Billing | Scaffold | Disabled |
| MCP / OAuth / ChatGPT connection | Strong | Strong foundation |
| Privacy export and account deletion | Strong | Strong foundation |
| Product analytics | Partial | — |
| Operational monitoring and alerts | Partial | — |
| PWA | Absent | — |
| Native iOS and Android applications | Absent | — |
| Final launch landing page | Partial | — |
| App Store / Play Store release foundation | Absent | — |

Allowed maturity classifications are `Strong`, `Functional`, `Partial`, `Scaffold`, `Absent`, and `Decision Required`.

## Confirmed highest-priority technical findings

1. PCS-2 consolidated duplicated private application startup work through one Production-verified bootstrap authority.
2. PCS-3 is closed with exact-deployment Production request evidence for Today and Workout History.
3. All canonical request-count, browser/server failure, privacy, and runtime-error gates passed across both approved synthetic fixtures.
4. PCS-3 latency results are an informational timestamped baseline; launch budgets require a later explicit decision.
5. PCS-4A is establishing the first permanent path-scoped Draft PR validation authority without changing release gates.
6. Different domains have different reliability maturity; Workouts is stronger than Nutrition.
7. Current Supabase organization is on the Free plan and is not final-launch infrastructure.
8. Repository control documents are the current authority; historical PR descriptions and chat memory are not.
