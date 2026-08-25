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
- The Workout History list route owns safe request correlation, private/no-store response headers, bounded `total`/`list`/`filters` timing, and one allowlisted completion log. These observability facts must not alter list, filter, cursor, detail, or ownership semantics.
- Do not create another workout-history or active-session database model.

### Nutrition

- Existing nutrition, food-log, meal-plan, hydration, and saved-meal data remain current runtime/data authorities until verified migration or transactional convergence replaces them.
- Canonical Nutrition product/design authority is mapped in `docs/control/PLAIVRA_NUTRITION_AUTHORITIES.md` and reconciled by `docs/superpowers/specs/2026-08-25-nutrition-wide-reconciliation-design.md` plus the page-specific reconciliation amendments.
- Canonical Nutrition IA has exactly four peer destinations: Diary, Meal Plan, Food Library, and My Recipes. Shopping List remains nested under Meal Plan. There is no Nutrition Summary destination; future Global Summary is a separate top-level cross-domain product.
- Diary owns actual intake truth. Meal Plan owns intended intake truth. Food Library owns Food identity. My Recipes owns Recipe identity, immutable published Recipe versions, Working Drafts, and Cooking Mode. Saved Meal is a shared contextual Nutrition utility, not a peer destination.
- Food, Recipe, and Saved Meal are distinct semantic types. Recipe-inside-Recipe and Saved-Meal-inside-Saved-Meal are excluded from V1.
- Every committed Recipe consumer retains `recipe_id`, `recipe_version_id`, resolved serving/quantity, frozen nutrition, and sufficient frozen display facts. Committed Saved Meal uses retain frozen resolved bundle snapshots. Source edits or deletion must never silently rewrite committed history.
- Recipe and Saved Meal deletion use `Delete → Recently Deleted → 30 days → Restore or Delete Now → permanent deletion`. Permanent live-source deletion never destroys already-frozen Diary/Meal Plan/Saved Meal consumer history.
- Diary and Meal Plan share one effective-dated Nutrition Target authority. Historical dates compare against the target effective for that date; later target changes are not retroactive truth mutation.
- Across Nutrition, missing nutrition is unknown, never zero.
- Nutrition AI follows external ChatGPT prompt → user review → explicit approval → authorized Plaivra MCP write where applicable. ChatGPT is not canonical nutrition fact authority and no embedded generic Nutrition chatbot is authorized.
- Multi-table mutations requiring all-or-nothing behavior must converge behind transactional server/database authority.
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

### Request measurement and observability

- Safe route timing and correlation are request-observability authorities. They may expose only bounded allowlisted metric names, outcomes, error codes, counts, and durations.
- PCS-3 Production evidence is collected only through the repository-owned read-only Playwright harness and approved populated/empty synthetic accounts.
- Exact deployed commit and migration identity are mandatory before authentication or measurement.
- Browser-observed request duration and server `Server-Timing` duration are distinct metrics. Decoded response bytes and `Content-Length` are also distinct metrics.
- Measurement evidence must exclude payloads, credentials, access tokens, cookies, browser storage, raw request IDs, user IDs, query values, opaque record IDs, private notes, and raw database errors.
- Measurement artifacts are review evidence, not runtime data authority, user telemetry, or an approved latency budget.
- The harness must not mutate data, create fixtures, use service role, expose a public measurement endpoint, or persist telemetry.

## Compatibility policy

| Domain | Current authority | Compatibility path | Retirement condition |
|---|---|---|---|
| Workouts | Canonical workout sessions, performed logs, Active Workout engine/store, atomic RPCs, and immutable snapshots | Existing bounded compatibility code may serve verified existing workout data; new work must use canonical authorities | Verified data coverage, approved migration strategy, rollback or forward-fix strategy, and Lead approval |
| Nutrition | Existing nutrition, food-log, meal-plan, hydration, and saved-meal runtime/data authorities plus the reconciled Nutrition V1 product/design authority chain | Existing compatibility paths may remain for current data, but new work must map explicitly to Food, Recipe, Saved Meal, Diary actual usage, and Meal Plan intended usage; stale mixed `saved_recipe`/custom-meal semantics are not product authority | Transactional convergence, verified data migration where required, rollback or forward-fix strategy, and Lead approval |
| Activity Catalog | Legacy Production provider | External Activity Catalog remains inactive and non-authoritative | Separate Lead-approved migration decision, verified data/provider readiness, migration strategy, rollback or forward-fix strategy, and Lead approval |

Compatibility code may remain when required for existing data. New features must not extend legacy paths unless explicitly approved. No new parallel source of truth is allowed. Legacy retirement requires data verification, migration strategy, rollback or forward-fix strategy, and Lead approval.
