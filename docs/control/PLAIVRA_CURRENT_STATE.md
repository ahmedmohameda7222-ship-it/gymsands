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

PCS-4 is complete. PCS-4A was squash-merged through PR #130 as `ac65a8b61e051756628992ec151288d6b47bfef2` and establishes the automatic path-scoped Draft PR validation authority while preserving canonical phase-close Quality, Exact Release, release preflight, deployment, and Production verification. The approved operating model is documented in [`docs/ci/pcs4-ci-operating-model.md`](../ci/pcs4-ci-operating-model.md).

Repository-level branch protection and provider-required checks were evaluated and deferred by Product Owner decision because the repository currently has one active owner and no team. The existing Phase A compatibility workflow remains unchanged. Provider controls must be reconsidered before collaborators or delegated merge authority are introduced.

## PCS-5 Production foundation

### PCS-5A exact Production deployment convergence

PCS-5A was squash-merged through PR #133 as:

```text
89b42af5cb844b0e8fbe2ca1a6e6bcf83b99488b
```

The first push-triggered Production convergence run `31025971421` passed. It correctly observed the prior Production commit during early bounded attempts and later proved exact convergence to `89b42af5cb844b0e8fbe2ca1a6e6bcf83b99488b` with the existing public release-readiness, schema identity, migration identity, and migration-ledger reconciliation facts healthy.

PCS-5A is merged, deployed, Production-verified, and complete. Its repository-owned read-only authority runs after every `main` push, hourly, and by manual dispatch; writes sanitized evidence on pass and failure; and performs no deployment, provider mutation, authenticated smoke, database write, or Production mutation. The authority is documented in [`docs/operations/pcs5a-production-deployment-convergence.md`](../operations/pcs5a-production-deployment-convergence.md).

### PCS-5B owner incident alert routing

PCS-5B was squash-merged through PR #134 as `d8a6d757425163683b98f3f546749aeffe003bb8`. Canonical Quality run `31036267653` passed on the approved PR head. Post-merge Production convergence run `31037578376` passed against the merge SHA. The first live owner-routing run `31037748484` passed with `no_active_incident`.

PCS-5B establishes GitHub-native owner-directed routing from completed `Production uptime synthetic` runs, requires two consecutive relevant failures before opening one SEV-1 issue, updates the same active incident idempotently, and closes it after recovery. PCS-5B is merged, live-verified, and complete. Its authority is documented in [`docs/operations/pcs5b-owner-alert-routing.md`](../operations/pcs5b-owner-alert-routing.md).

PCS-5 remains in progress. Independent external monitoring, broader runtime/OAuth/MCP/deletion/billing/retention signal coverage, provider procurement, backup/restore closure, authenticated post-deploy smoke, and final launch authorization remain separate later authorities.

## P8 product reporting

P8A is active as the current Product Completion implementation candidate. It establishes one server-generated PDF report for a single performed workout and the reusable repository-owned PDF foundation required by later bounded report work.

By Product Owner decision, P6B live acceptance and P7 notifications remain deferred. P8B remains later work. PCS-5 backup and restore authority remains deferred and open; P8A does not change or close PCS-5.

## Current program

- PCS-1 Repository Control Plane — complete.
- PCS-2 Private App Bootstrap — complete and Production-verified.
- PCS-3 Request Architecture — complete, Production-measured, and closed.
- PCS-4 CI Operating Model — complete.
- PCS-5 Production Foundation — in progress; PCS-5A and PCS-5B are complete, while broader monitoring and backup/restore work remain open.

## Feature maturity

| Capability | Classification | Confirmed note |
|---|---|---|
| Authentication / account / onboarding | Functional | Private startup converged through the PCS-2 bootstrap authority |
| Workouts plans and execution | Strong | — |
| Active Workout offline and multi-device | Strong | — |
| Workout History | Strong | PCS-3 request stability and canonical Production measurement are complete; the recorded baseline is not a launch SLA |
| Muscle Intelligence and Heat Maps | Strong | Strong foundation |
| Today | Functional | PCS-3B projection and Production measurement are complete; initial direct browser-to-Supabase reads measured zero |
| Nutrition and food logging | Functional | Nutrition V1 Draft candidate is implemented; its repository migration chain is applied and reconciled in Production, while the application runtime is not yet merged or deployed |
| Meal planning | Functional | Nutrition V1 Draft candidate implements week-authoritative planning, canonical Shopping, atomic lazy creation, durable owner-scoped mutation replay, and exact-first offline retry before conflict reconciliation |
| Hydration | Functional | — |
| Progress and body measurements | Functional | — |
| Progress photos | Functional | Delete-compensation debt |
| Wellness, sleep, habits, supplements | Functional | Fragmented product presentation |
| Daily Tasks | Partial | Product relationship with Today is unresolved |
| My Recipes | Functional | Nutrition V1 standalone Recipe experience is implemented in Draft; Recipe and Saved Meal command migrations, including replay-safe Saved Meal creation, are applied in Production while the application runtime is not yet merged or deployed |
| Notifications | Scaffold | Preferences exist but no delivery engine |
| PDF reports | Partial | Grocery PDF exists; general reporting does not |
| Activity Catalog external service | Scaffold | Inactive; current provider is legacy |
| Billing | Scaffold | Disabled |
| MCP / OAuth / ChatGPT connection | Strong | Strong foundation |
| Privacy export and account deletion | Strong | Strong foundation |
| Product analytics | Partial | — |
| Operational monitoring and alerts | Partial | PCS-5A exact public deployment convergence and PCS-5B GitHub-native owner incident routing are complete; independent monitoring and broader signals remain later work |
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
5. PCS-4 is closed with the merged PCS-4A path-scoped Draft PR validation authority; repository provider protection is deferred while the repository remains single-owner.
6. PCS-5A and PCS-5B are merged, Production/live-routing verified, and complete; PCS-5 remains open for broader monitoring and backup/restore authority.
7. GitHub-native routing is not independent external monitoring and does not close broader runtime, OAuth/MCP, deletion, billing, retention, or backup alerting.
8. Current Supabase organization is on the Free plan and is not final-launch infrastructure; backup/restore authority remains unresolved.
9. Nutrition V1 migration history is reconciled through `20260828220542_nutrition_v1_saved_meal_creation_idempotency` with 112 physical Production records and no pending/unresolved repository migrations; Nutrition application runtime remains a Draft candidate until PR #152 is merged, deployed, and Production-runtime verified under separate release authority.
10. Repository control documents are the current authority; historical PR descriptions and chat memory are not.

## Nutrition V1 implementation candidate — Draft PR #152

Nutrition V1 is implemented as the approved 20-task Draft candidate plus the approved architectural and pre-merge corrections on `feat/nutrition-v1-implementation`. Runtime corrections now include owner-scoped Recipe recovery, Recipe revision CAS and structured graph identity, Diary and Food-to-New-Recipe durable operation replay, Published Recipe/Working Draft projection convergence, Today Shopping/skip convergence onto Nutrition V1 authorities, durable Meal Plan mutation replay with exact-first offline retry before any target-level conflict reconciliation, and replay-safe Saved Meal creation. The latest Meal Plan runtime queue correction was committed as `773fe5f234fa66c1f703ea04e347f10e2049e43e`; later commits added the Saved Meal replay authority, migration/control-plane reconciliation, and bounded rendered-QA harness correction without changing approved Nutrition product behavior.

The implementation preserves the approved four-peer Nutrition IA (`Diary`, `Meal Plan`, `Food Library`, `My Recipes`) with Shopping nested under Meal Plan and Saved Meal contextual rather than peer navigation. It includes canonical Recipe/Saved Meal versioning and 30-day recovery, nullable nutrition truth, frozen consumer snapshots, effective-dated targets, owner-scoped local recovery, active-only Food Catalog discovery, database-authoritative scalable Food Library filtering/ranking/keyset pagination, transactional Cooking state and Start Over authority, transactional Recipe/Saved Meal write authority, atomic published-Recipe Working Draft creation, UUID Cooking timer identity, Diary actual-vs-planned separation, week-authoritative Meal Plan/offline conflict handling, same-week occurrence-date enforcement, atomic lazy Meal Plan week creation, durable owner-scoped Meal Plan operation idempotency, exact-first persisted queue replay, replay-safe Saved Meal creation, EN/DE/AR localization, privacy/export/deletion consumers, MCP authority convergence, and repository-controlled automatic retention purge scheduling.

The final rendered-QA correction was closed with explicit RED→GREEN evidence rather than by weakening the 44px accessibility threshold. Test-only commit `629511eeda8a200fa923b6beae3744d127e85376` added a regression requiring the Saved Meal utility launcher to remain above the 44px subpixel boundary; PR Quality run `33155015154` failed exactly that new test while the launcher remained `min-h-11`. Runtime commit `8047633962fc18ce59db58120ffcd73d20e73135` changed only that launcher height contract to `min-h-12` (48px). The same Nutrition rendered matrix then passed, including the previously failing `diary-loading` scenario.

A later exact-head PR Quality run exposed one QA-contract-only false negative in `recipes-mobile-cooking-complete`: the page visibly rendered the approved completion state and all four approved post-cooking actions, but Chromium `innerText` reflected the CSS `uppercase` transform as `COOKING COMPLETE` while the harness required a case-sensitive `Cooking complete`. Test-only commit `ff76f004d656afbb9ac4eb9add36d65a4a32759f` added a regression that requires CSS-transformed semantic text to match while still rejecting genuinely absent content; script-contract CI failed exactly because the helper did not yet exist. GREEN commit `eb9a24f7c75a6445a0846bda57dad84e5137e0f5` added only Unicode/case normalization for the bounded required-evidence matcher and left all product UI, Arabic locale assertions, layout, focus, console, and touch-target gates unchanged.

The Meal Plan pre-merge findings were closed with RED→GREEN evidence. Test-only head `ed7c335c1e7675adfd4b60a008b0dc2b0d167634` failed exactly two tests: direct week insertion occurred before the mutation RPC, and a cross-week `planDate` was accepted. The bounded runtime/migration correction on `0a2edefe8d408396fac3fcae39401814fc8f2d54` removed the separate week insert, passed `weekStartDate` into the mutation envelope, rejected occurrence dates outside the seven-day target week, and added forward-only migration `20260828032500_nutrition_v1_meal_plan_week_atomicity.sql`. Later TDD proved a second Meal Plan defect: the command accepted `operationId` but did not persist/replay it, so an ambiguous successful commit could be retried as a stale revision. Forward migration `20260828210000_nutrition_v1_meal_plan_mutation_idempotency.sql` adds a private owner-scoped replay ledger and replays identical commands before CAS. Client RED `3ff2a0310bfeb89aac380fc152800abd7aa55046` then proved the durable queue lacked an exact-first replay primitive; runtime commits `aecfa83dcaa3145fb5fa90688f25249922844124` and `773fe5f234fa66c1f703ea04e347f10e2049e43e` preserve the original operation/week/base/mutation envelope, attempt it before reconciliation, and only rebase after the canonical stale CAS signal. Transient or ambiguous failures retain the exact envelope for retry.

Earlier permanent Draft validation runs proved the broad Nutrition implementation and rendered matrix, including Phase A, PR Quality, Exercise Detail Runtime QA, Exercise Library Locale Runtime QA, lint/typecheck/unit, chronological migration replay, database lint/verification/ledger/integration, production build, general rendered QA, Train/Active Workout QA, and Workout History QA. Every new closure correction is required to repeat those exact-head gates before merge-readiness can be claimed.

### Nutrition V1 Production migration closure

All nineteen Nutrition V1 repository migrations are now represented in reconciled Plaivra Production migration history under generated version aliases. The first eight were applied on 2026-08-27; the remaining eleven closure and bounded correction migrations were applied on 2026-08-28. No repository migration remains pending or unresolved.

| Migration state | Verified value |
|---|---|
| Production project | `bkwezjxvapaeasfvlhvv` |
| ledger capturedAt | `2026-08-28T22:17:51Z` |
| physical Production migration records | `112` |
| pendingMigrationCount | `0` |
| schemaVerifiedUntrackedCount | `0` |
| unresolvedMigrationCount | `0` |
| migration history repair state | `reconciled` |
| migration-ledger releaseReady | `true` |
| latest physical Production migration | `20260828220542_nutrition_v1_saved_meal_creation_idempotency` |
| released compatibility marker | `20260724232734` — unchanged |

The eleven 2026-08-28 generated Production identities are:

1. `20260828091053_nutrition_v1_final_architecture_corrections`
2. `20260828091108_nutrition_v1_cooking_command_authority`
3. `20260828091147_nutrition_v1_final_closure`
4. `20260828091159_nutrition_v1_timer_instance_identity`
5. `20260828091228_nutrition_v1_working_draft_command`
6. `20260828100730_nutrition_v1_meal_plan_week_atomicity`
7. `20260828112951_nutrition_v1_recipe_draft_revision`
8. `20260828170752_nutrition_v1_recipe_draft_graph_identity`
9. `20260828181729_nutrition_v1_recipe_preseed_idempotency`
10. `20260828193416_nutrition_v1_meal_plan_mutation_idempotency`
11. `20260828220542_nutrition_v1_saved_meal_creation_idempotency`

A concurrent duplicate execution of the Meal Plan atomicity SQL briefly produced later history identity `20260828100735_nutrition_v1_meal_plan_week_atomicity`. Both stored statements were verified byte-equivalent and the migration is schema-idempotent with no application-row DML. A guarded metadata-only repair required exactly two matching records and exact statement equality before removing only the redundant later history row. The canonical first identity `20260828100730` remains; later bounded migrations were each applied exactly once; Production now contains 112 migration records; and neither application data nor schema authority was rolled back.

Read-only Production verification after the latest application confirmed both private replay authorities exist: `private.nutrition_meal_plan_mutation_operations` and `private.nutrition_saved_meal_creation_operations`. Authenticated users cannot directly read or mutate the Meal Plan ledger and cannot directly read/insert the Saved Meal creation ledger. `public.mutate_nutrition_meal_plan_week(uuid,bigint,jsonb)` and `public.create_nutrition_saved_meal_idempotent(uuid,text,text,boolean,jsonb)` remain authenticated command surfaces while `anon` cannot execute them. Disposable verification proves identical owner-scoped operation replay converges before duplicate mutation/create effects, changed-input operation-ID reuse is rejected, failed commands leave no replay-ledger or domain-write residue, and another owner cannot observe/replay the first owner's operation. The generated Saved Meal migration identity `20260828220542_nutrition_v1_saved_meal_creation_idempotency` exists exactly once. The previously applied Food Library, Cooking, Recipe, timer, Working Draft, Recipe graph, atomic Recipe preseed, Meal Plan atomicity, and Meal Plan replay authorities remain represented in the reconciled ledger.

The Production migration work did **not** merge PR #152, deploy Nutrition V1 application code, promote the compatibility marker, or modify Activity Catalog Production.

The final migration-ledger reconciliation and this state update create a new control-plane PR head after the latest QA correction. Fresh exact-head Draft validation, canonical phase-close Quality, Exact Release, release preflight, and the independent pre-merge code review must all be green on an unchanged candidate before merge-readiness can be claimed. Application deployment, Production runtime verification, merge, and final Product Owner approval remain separate later gates.

PR #152 remains open and Draft. No merge is authorized by this state reconciliation.
