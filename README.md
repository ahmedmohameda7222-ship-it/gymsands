# Plaivra

Plaivra is a user-controlled fitness context, execution, tracking, history, and visualization platform designed to work with ChatGPT.

```text
User maintains Plaivra context
-> connects Plaivra to ChatGPT
-> grants task-specific read/write permission
-> asks for advice or an action
-> ChatGPT reads the minimum authorized context
-> ChatGPT calls authorized Plaivra tools
-> Plaivra stores, visualizes, tracks, edits, and corrects the result
```

Plaivra does not independently generate workout or meal plans, diagnose medical conditions, or add a copy/import/review queue after successful tool execution. Direct product controls remain available for real-world execution, correction, privacy, export, and deletion.

## Authoritative documentation

Read in this order:

1. `docs/product/PLAIVRA_PRODUCT_CONSTITUTION.md`
2. `docs/product/PLAIVRA_LONG_TERM_PRODUCT_AND_PLATFORM_PLAN.md`
3. `docs/product/ai-first-tracker-model.md`
4. `docs/design-system/PLAIVRA_CROSS_PLATFORM_UI_CONSTITUTION.md`
5. the relevant file under `docs/design-system/platforms/`
6. `docs/chatgpt-app/README.md`
7. `docs/chatgpt-app/cimd-authentication-architecture.md`
8. `docs/architecture/canonical-domain-model.md`
9. `docs/platform-roadmap/README.md`

Merged pull requests and Git history preserve implementation evidence. Old prompts, branch handoffs, audit snapshots, generated QA screenshots, and completed status reports are not current authority and should not remain in the active tree.

## Current stack

- Next.js App Router, React, and TypeScript
- Tailwind CSS and shared design tokens
- Supabase Auth, PostgreSQL, RLS, Storage, and migrations
- MCP server with OAuth/CIMD account connection infrastructure
- Vitest, Node test runner, Playwright, and repository release gates
- Node.js 24.x and npm with the committed lockfile

## Repository areas

- `app/` - product routes and API endpoints
- `components/` - reusable UI and domain components
- `lib/` - auth, MCP, privacy, security, validation, release, and shared helpers
- `services/` - domain service and database boundaries
- `types/` - shared application and database contracts
- `supabase/migrations/` - immutable migration chain
- `supabase/verification/` - executable database verification
- `docs/` - current product, platform, design, release, and architecture authority
- `.codex/skills/graphify/` - local repository graph skill
- `.agents/` - optional specialist skills, not a default execution stack

## Current architecture status

- Web is the active product surface.
- Public MCP, OAuth/CIMD, task-specific context projections, privacy, idempotency, and release foundations exist; publication and full production acceptance remain separate gates.
- Train Phase 2A provides the additive multi-week hierarchy; the legacy plan writer remains active until later cutover phases.
- Muscle Intelligence Phase 2 versions and validates the approved 60-exercise registry, six normalized curation tables, 60 mappings with 180 entries, 180 localizations, 180 aliases, 32 relationships, nine exact provider links, and five golden-plan fixtures.
- Muscle Intelligence Phase 3 preserves immutable per-session muscle snapshots and hardened owner-scoped lifecycle authority.
- Muscle Intelligence Phase 4A provides the approved advanced visible atlas and schema-isolated V2 publication foundation while retaining V1 runtime behavior.
- Muscle Intelligence Phase 4B publishes 60 reviewed advanced V2 mappings with 453 regional entries and adds plan-building, plan-editing, exercise-preview, and weekly-plan visualization surfaces. It does not cut Active Workout, completion, history, or workout-session snapshots over to V2.
- Phase 4C.1 is implemented on its Draft PR as a pending runtime cutover: existing V1 snapshots stay unchanged, new sessions use V2 after the migration is explicitly applied, and completed V2 workload is frozen independently from mutable set logs.
- Production migration history remains reconciled through `20260719094718`; nine Phase 4C.1 repository migrations are pending and have not been applied. The deployed compatibility marker intentionally remains `20260717051011` until a separately authorized coordinated release.

## Pending Phase 4C.1 migrations

- `20260719223000_muscle_intelligence_phase4c1_runtime_v2_cutover.sql`
- `20260719223010_muscle_intelligence_phase4c1_snapshot_support.sql`
- `20260719223020_muscle_intelligence_phase4c1_v2_snapshot_freeze.sql`
- `20260719223030_muscle_intelligence_phase4c1_direct_session_v2.sql`
- `20260719223040_muscle_intelligence_phase4c1_replacement_v2.sql`
- `20260719223050_muscle_intelligence_phase4c1_terminal_reconcile_v2.sql`
- `20260719223100_muscle_intelligence_phase4c1_terminal_history_guard.sql`
- `20260719223200_muscle_intelligence_phase4c1_set_type_refresh.sql`
- `20260719223300_muscle_intelligence_phase4c1_trusted_log_cleanup.sql`

These nine files are classified as pending and form one ordered Phase 4C.1 runtime cutover chain. They must not be applied, repaired as applied, merged, or deployed without explicit coordinated authorization. Do not replay any already-applied migration.
