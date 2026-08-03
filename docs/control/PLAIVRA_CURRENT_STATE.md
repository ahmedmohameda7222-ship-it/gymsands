# Plaivra Current State

## Last audited runtime baseline

- Last audited application/runtime baseline before PCS-1:
  `main@525982e33920d2a94a15b875993850a4877aa8a5`
- At the time of the audit, Production reported the same commit and `/api/version` returned HTTP 200.
- PCS-1 changes documentation and project governance only; it does not change application runtime behavior.
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

## Current program

- PCS-1 Repository Control Plane — complete.
- PCS-2 Private App Bootstrap — current implementation candidate; unclosed pending Lead QA/QC, Production migration authorization, squash merge, and Production verification.
- PCS-3 Request Architecture — planned.
- PCS-4 CI Operating Model — planned.
- PCS-5 Production Foundation — planned.

## Feature maturity

| Capability | Classification | Confirmed note |
|---|---|---|
| Authentication / account / onboarding | Functional | — |
| Workouts plans and execution | Strong | — |
| Active Workout offline and multi-device | Strong | — |
| Workout History | Strong | Duplicate-request performance debt |
| Muscle Intelligence and Heat Maps | Strong | Strong foundation |
| Today | Functional | Request-waterfall debt |
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

1. PCS-2 addresses duplicated private application startup work through one bootstrap authority; the candidate remains unclosed until its required review, migration, merge, and Production verification complete.
2. Workout History produces repeated request groups.
3. Today performs a broad client-side request waterfall.
4. Different domains have different reliability maturity; Workouts is stronger than Nutrition.
5. CI and test scripts retain phase-based duplication and are too slow for daily development.
6. Current Supabase organization is on the Free plan and is not final-launch infrastructure.
7. Repository planning documents were stale and were not a reliable current-state authority.
