# Plaivra Architecture Authorities

## Domain authority map

### Account

- Supabase Auth is identity authority.
- Private application startup converges through `public.get_private_app_bootstrap_v1()` and AuthProvider's user-scoped, memory-only bootstrap authority.
- The bootstrap atomically owns initial profile, account-access, consent, eligibility, onboarding-completion, and user-settings facts for the authenticated client session.
- ProtectedRoute is a deterministic consumer of bootstrap authority and must not fetch account startup data.
- No parallel client boot authority or duplicate startup fact store is allowed.

### Today

- The versioned authenticated `/api/dashboard/today` projection is the Today browser read authority.
- One owner/date/timezone key owns one browser request snapshot. The AuthProvider session is the browser authentication authority, while the route derives owner identity from `requireUser(request)` and uses its RLS-bound Supabase client.
- The projection returns minimum-data domain summaries with safe partial-error envelopes. It is not a new fact model; existing workout, meal, nutrition, hydration, grocery, wellness, profile, and progress authorities remain canonical.
- Existing domain mutation authorities remain canonical. Authoritative mutation results may update the local Today projection; uncertain consistency may trigger one coordinated projection refresh.
- Direct Today browser-to-Supabase initial read fan-out, per-domain read authorities, service-role projection reads, giant cross-domain SQL projection functions, dual old/new loading, and persistent browser projection caching may not return.

### Workouts

- `workout_sessions` and canonical performed logs are workout-performance truth.
- The Active Workout session engine/store and database atomic RPCs own active execution.
- Immutable snapshots preserve historical prescriptions and muscle mappings.
- Workout History is a projection over canonical workout authorities, not a separate fact store.
- The current URL is the committed Workout History list-query authority. Search input and custom dates remain local only while they are uncommitted drafts; selected-item and filter-panel state are presentation state, not data-query authority.
- One canonical owner/query key, derived from the normalized list request, owns first-page browser request identity. Equivalent committed queries share ready or in-flight work, while cursor requests remain independent.
- AuthProvider session state is the Workout History browser authentication authority. Normal list and detail requests receive the current access token explicitly and must not independently resolve the Supabase session.
- Do not create another workout-history or active-session database model.

### Nutrition

- Existing nutrition, food-log, meal-plan, hydration, and saved-meal data remain current authority.
- Multi-table mutations requiring all-or-nothing behavior must eventually converge behind transactional server/database authority.
- Do not add parallel nutrition fact stores.

### Progress

- Existing progress entries, body measurements, records, and private progress-photo storage remain authoritative.
- Storage object and metadata lifecycle must remain owner-scoped and consistent.

### Wellness

- Existing sleep, habits, supplement, and related logs remain current authorities.
- Product presentation may later converge, but data must not be duplicated for a UI redesign.

### Privacy

- Existing export, privacy-request, deletion-job, token revocation, retention, and account-lock architecture remains authoritative.

### MCP / OAuth

- Existing Plaivra OAuth/MCP authorization and context boundaries remain authoritative.
- AI must never claim a write succeeded before the Plaivra tool/database authority confirms it.

### Activity Catalog

- Current Production application provider mode is legacy.
- The separate Activity Catalog project is inactive and must not be treated as current runtime authority.
- No migration to the external catalog occurs until a separate Lead-approved decision.

### Billing

- Billing infrastructure is scaffolded and checkout remains disabled until separately approved.

## Compatibility policy

| Domain | Current authority | Compatibility path | Retirement condition |
|---|---|---|---|
| Workouts | Canonical workout sessions, performed logs, Active Workout engine/store, atomic RPCs, and immutable snapshots | Existing bounded compatibility code may serve verified existing workout data; new work must use canonical authorities | Verified data coverage, approved migration strategy, rollback or forward-fix strategy, and Lead approval |
| Nutrition | Existing nutrition, food-log, meal-plan, hydration, and saved-meal authorities | Existing compatibility paths may remain for current data but must not become new fact stores or receive unapproved feature expansion | Transactional convergence, verified data migration where required, rollback or forward-fix strategy, and Lead approval |
| Activity Catalog | Legacy Production provider | External Activity Catalog remains inactive and non-authoritative | Separate Lead-approved migration decision, verified data/provider readiness, migration strategy, rollback or forward-fix strategy, and Lead approval |

Compatibility code may remain when required for existing data. New features must not extend legacy paths unless explicitly approved. No new parallel source of truth is allowed. Legacy retirement requires data verification, migration strategy, rollback or forward-fix strategy, and Lead approval.
