# Plaivra Current State

## Verified repository and Production baseline

- Main commit: `525982e33920d2a94a15b875993850a4877aa8a5`
- Production deployment reports the same commit.
- `/api/version` returns HTTP 200.

## Production compatibility

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

## Current program

- PCS-1 Repository Control Plane — in progress.
- PCS-2 Private App Bootstrap — planned.
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

1. Private application boot performs duplicated authentication, profile, consent, eligibility, onboarding, and settings work.
2. Workout History produces repeated request groups.
3. Today performs a broad client-side request waterfall.
4. Different domains have different reliability maturity; Workouts is stronger than Nutrition.
5. CI and test scripts retain phase-based duplication and are too slow for daily development.
6. Current Supabase organization is on the Free plan and is not final-launch infrastructure.
7. Repository planning documents were stale and were not a reliable current-state authority.
