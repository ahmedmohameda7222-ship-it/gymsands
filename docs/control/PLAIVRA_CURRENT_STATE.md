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

These facts verify deployment identity and immediate runtime health only. PCS-3B request counts, decoded response sizes, browser durations, server-duration p50/p95, and browser-visible failure evidence are not yet recorded and must not be claimed as Production-proven.

### PCS-3C.1 Production request measurement authority

PCS-3C.1 is the current implementation candidate. It adds:

- bounded safe `total`, `list`, and `filters` timing plus correlation and completion logging to the Workout History list route without changing History semantics;
- one repository-owned read-only Playwright measurement harness;
- exact deployed identity gating;
- approved populated and empty synthetic-account authority;
- hard Today and Workout History request-count invariants;
- separate browser duration, server duration, decoded-byte, and Content-Length metrics;
- nearest-rank account and combined summaries;
- sanitized JSON and Markdown evidence only.

No Production measurement is performed by the PCS-3C.1 Draft PR. Request counts and p50/p95 values remain unrecorded. PCS-3 remains open, and PCS-3C.2 is still required for the post-merge Production run, evidence review, Vercel runtime-error verification, and docs-only reconciliation.

## Current program

- PCS-1 Repository Control Plane — complete.
- PCS-2 Private App Bootstrap — complete and Production-verified.
- PCS-3 Request Architecture — in progress; PCS-3A and PCS-3B are merged/deployed, PCS-3C.1 is the current candidate, and PCS-3C.2 remains required.
- PCS-4 CI Operating Model — planned.
- PCS-5 Production Foundation — planned.

## Feature maturity

| Capability | Classification | Confirmed note |
|---|---|---|
| Authentication / account / onboarding | Functional | Private startup converged through the PCS-2 bootstrap authority |
| Workouts plans and execution | Strong | — |
| Active Workout offline and multi-device | Strong | — |
| Workout History | Strong | PCS-3A request-stability architecture is merged/deployed; Production request evidence is deferred to PCS-3C.2 |
| Muscle Intelligence and Heat Maps | Strong | Strong foundation |
| Today | Functional | PCS-3B authenticated server projection is merged/deployed; Production request evidence is deferred to PCS-3C.2 |
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
2. PCS-3A Workout History request stability is merged/deployed; Production request-count verification remains deferred to PCS-3C.2.
3. PCS-3B Today server projection is merged/deployed and immediate runtime health is verified; Production request and latency evidence remains deferred to PCS-3C.2.
4. PCS-3C.1 is establishing the durable read-only measurement authority; it does not record Production measurements.
5. Different domains have different reliability maturity; Workouts is stronger than Nutrition.
6. CI and test scripts retain phase-based duplication and are too slow for daily development.
7. Current Supabase organization is on the Free plan and is not final-launch infrastructure.
8. Repository control documents are the current authority; historical PR descriptions and chat memory are not.
