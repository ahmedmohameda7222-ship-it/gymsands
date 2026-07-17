# Plaivra

Plaivra is a user-controlled persistent fitness context, execution, tracking, history, and visualization platform designed to work with ChatGPT.

A user maintains their profile once, grants specific permissions, and asks ChatGPT to create or update plans and tracking data. ChatGPT performs the reasoning and calls authorized Plaivra tools. Plaivra stores the confirmed structured result and makes it usable through the web product and future native clients.

## Product model

```text
User maintains Plaivra context
→ connects Plaivra to ChatGPT
− grants task-specific read/write permissions
→ asks for advice or an action
₂ ChatGPT reads minimum authorized context
₂ ChatGPT calls Plaivra tools when execution is requested
→ Plaivra stores, visualizes, tracks, edits, and corrects the result
```

Plaivra does not independently generate workout or meal plans, diagnose medical conditions, or require a copy/import/review queue after successful ChatGPT tool execution. Direct controls remain available for real-world execution, correction, privacy, export, and deletion.

## Authoritative documentation

Read in this order:

1. `docs/product/PLAIVRA_PRODUCT_CONSTITUTION.md`
2. `docs/product/PLARIVRA_LONG_TERM_PRODUCT_AND_PLATFORM_PLAN.md`
3. `docs/product/ai-first-tracker-model.md`
4. `docs/design-system/PLAIVRA_CROSS_PLATFORM_UI_CONSTITUTION.md`
5. the relevant file under `docs/design-system/platforms/`
6. `docs/chatgpt-app/README.md`
7. `docs/chatgpt-app/cimd-authentication-architecture.md`
8. `docs/architecture/canonical-domain-model.md`
9. `docs/platform-roadmap/README.md`

Merged pull requests and Git history preserve implementation evidence. Old prompts, branch handoffs, audit snapshots, generated QA screenshots, and completed status reports are not current product or release authority and should not be committed to the active tree.

## Current stack

- Next.js App Router, React, and TypeScript
- Tailwind CSS and shared design tokens
- Supabase Auth, PostgreSQL, RLS, Storage, and migrations
- MCP server with OAuth/CIMD account connection infrastructure
- Vitest, Node test runner, Playwright, and repository release gates
- Node.js 24.x and npm with the committed lockfile

## Repository areas

- `app/` — product routes and API endpoints
- `components/` — reusable UI and domain components
- `lib/` — auth, MCP, privacy, security, validation, release, and shared helpers
- `services/` — domain service and database boundaries
- `types/` — shared application and database contracts
- `supabase/migrations/` — immutable migration chain
- `supabase/verification/` — executable database verification
- `docs/` — current product, platform, design, release, and architecture authority
- `.codex/skills/graphify/` — local repository graph skill
- `.agents/` — optional specialist skills; not a default execution stack

## Current architecture status

- Web is the active product surface.
- Public MCP, OAuth/CIMD, task-specific context projections, privacy, idempotency, and release foundations exist; platform publication and full production acceptance remain separate gates.
- Train Phase 2A provides the additive multi-week program hierarchy, while the legacy plan writer remains active until later cutover phases.
- Muscle Intelligence Phase 1 provides the versioned taxonomy, mapping authority, database foundation, and deterministic calculation engine without changing visible Train behavior or seeding trusted mappings.
- Entitlement and billing foundations exist, but checkout remains disabled until offerings and release controls are approved.
- No native iOS or Android binary exists yet.

## Environment

Copy `.env.example` and configure only the providers in use. Critical production values are validated before build without printing secret values.

Canonical browser-safe variables include:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_USE_MOCK_AUTH`
- `NEXT_PUBLIC_CHATGPT_CONNECT_URL`
- `NEXT_PUBLIC_PLAIVRA_MCP_SERVER_URL`

Canonical server-only variables include:

- `SUPABASE_SERVICE_ROLE_KEY`
- `PLAIVRA_MCP_BASE_URL`
- `PLAIVRA_MCP_TOKEN_SECRET`
- `PLAIVRA_CHATGPT_REDIRECT_URIS`
- `PLAIVRA_CIMD_ALLOWED_ORIGINS`
- `CRON_SECRET`:- billing, retention, email, and provider secrets documented in `.env.example`

Never commit real secrets or production tokens.

## Supabase migrations

Machine-readable authority: [`supabase/migration-ledger.json`](supabase/migration-ledger.json)

Human reconciliation record: [`docs/architecture/migration-ledger-reconciliation.md` ](docs/architecture/migration-ledger-reconciliation.md)

Verified production state on 2026-07-17:

- 34 applied migrations;
- latest migration: `20260716215602_muscle_intelligence_phase1_foundation`;
- `pendingCount=0` ;
- `schemaAppliedUntrackedCount=0` ;
- `unresolvedCount=0` ;
- `historyRepair.state=reconciled`;
- migration-ledger release readiness is true, while complete application release readiness still depends on exact-head CI, deployment identity, compatibility, and smoke gates..

Never replay, rename, rewrite, delete, or manually reorder an applied migration. Do not use seed documentation as migration authority.

## Local development

Use Node.js 24.x as declared by `package.json`, `.nvmrc`, and `.node-version`.

```bash
npm ci
npm run lint
npm run migration:ledger:check
npm run test:scripts
npm run typecheck
npm run test:unit
npm run test:integration
npm run build
```

Run only scripts that exist in `package.json`.

## Release integrity

A merge to `main` is production-triggering under the current Vercel Git model. Before merge, require exact-head review, reconciled migration history, passing Quality and release preflight, and explicit authorization. After merge, verify that Vercel built the resulting exact `main` SHA and complete the required version, health, and browser smoke checks.

See `docs/release/README.md` and `docs/operations/launch-runbook.md`.

## Repository hygeine

- Keep generated QA screenshots, logs, manifests, and reports in CI artifacts or external release evidence, not the active source tree.
- Keep only runtime-referenced product assets under `public/`.
- Do not preserve obsolete compatibility code or documentation after dependency proof.
- Use Git history and merged pull requests for historical evidence.
- Run Graph