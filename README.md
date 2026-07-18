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
- The generated 600-row legacy exercise catalog remains retired. The reviewed 60-exercise curated registry and mapping cohort are applied to production and tracked through migration `20260717051011_muscle_intelligence_phase2_curated_seed`.
- Muscle Intelligence Phase 3 production history is applied and reconciled through `20260717215900_muscle_intelligence_phase3_set_log_completion_authority`. Draft PR #68 contains the complete reviewed Phase 3 implementation and correction chain; no Phase 3 migration remains pending.
- Entitlement and billing foundations exist, but checkout remains disabled until offerings and release controls are approved.
- No native iOS or Android binary exists.

## Environment

Copy `.env.example` and configure only the providers in use. Never commit real secret values or production tokens.

Canonical browser-safe variables include:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_USE_MOCK_AUTH`
- `NEXT_PUBLIC_CHATGPT_CONNECT_URL`
- `NEXT_PUBLIC_PLAIVRA_MCP_SERVER_URL`

## Supabase migrations

Machine authority: `supabase/migration-ledger.json`

Human record: `docs/architecture/migration-ledger-reconciliation.md`

Verified production state after all reviewed PR #68 corrections:

- 45 applied migrations;
- latest production migration: `20260717215900_muscle_intelligence_phase3_set_log_completion_authority`;
- `pendingCount=0` and `unresolvedCount=0`;
- `schemaAppliedUntrackedCount=0`;
- `historyRepair.state=reconciled`;
- ledger-level migration release readiness is true;
- the compatibility marker remains `20260717051011` and intentionally has not advanced;
- 11 Auth users, 11 profiles, nine performed sessions, nine snapshots, and 29 snapshot items remain present;
- no workout session is missing a snapshot, no snapshot owner mismatch exists, and no duplicate snapshot envelope exists;
- the account-deletion purge is service-role-only;
- direct-session, replacement eligibility, plan-session start, set-log, and completion RPCs are actor-validated, `SECURITY DEFINER`, fixed-search-path boundaries with intended ACLs;
- all three normal Train history-preservation triggers remain enabled.

Never replay, rename, rewrite, delete, or manually reorder an applied migration. Seed documentation is not migration authority.

## Local validation

Use Node.js 24.x.

```bash
npm ci
npm run lint
npm run migration:ledger:check
npm run registry:phase2:seed:check
npm run test:muscle-intelligence:phase2
npm run test:scripts
npm run typecheck
npm run test:unit
npm run test:integration
npm run build
```

Run only scripts that exist in `package.json`.

## Release integrity

A merge to `main` is production-triggering under the current Vercel Git model. Before merge, require exact-head review, reconciled migration history, passing Quality and release preflight, and explicit authorization. After merge, verify the exact deployed `main` SHA and complete version, health, and browser smoke checks.

See `docs/release/README.md` and `docs/operations/launch-runbook.md`.

## Repository hygiene

- Keep generated QA screenshots, logs, manifests, and reports in CI artifacts or external release evidence.
- Keep runtime-referenced product assets under `public/`.
- Remove obsolete compatibility files only after dependency proof.
- Use Git history and merged pull requests for historical evidence.
- Run Graphify from clean, current `main`.

## Safety and privacy

Plaivra is a general fitness context and tracking product. It does not diagnose, treat, prescribe, or replace qualified medical care. ChatGPT access is task-specific, permissioned, minimized, audited, and revocable.
