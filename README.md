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
- Muscle Intelligence Phase 2 versions and validates the approved 60-exercise registry, six normalized curation tables, 60 mappings with 180 entries, 180 localizations, 180 aliases, 32 relationships, nine exact provider links, and five golden-plan fixtures without changing visible Train behavior.

## Pending Phase 4B database migrations

The following reviewed Phase 4B migrations are present on the Draft PR branch and are not yet classified as applied in production. Do not replay or apply them out of order. Production application, verification, ledger reconciliation, merge, and deployment remain separate gates.

```text
20260719210001_muscle_intelligence_phase4b_advanced_mappings_part_01.sql
20260719210002_muscle_intelligence_phase4b_advanced_mappings_part_02.sql
20260719210003_muscle_intelligence_phase4b_advanced_mappings_part_03.sql
20260719210004_muscle_intelligence_phase4b_advanced_mappings_part_04.sql
20260719210005_muscle_intelligence_phase4b_advanced_mappings_part_05.sql
20260719210006_muscle_intelligence_phase4b_advanced_mappings_part_06.sql
```
