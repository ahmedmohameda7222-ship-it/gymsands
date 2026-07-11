# Plaivra

Plaivra is a user-controlled persistent fitness context, execution, tracking, history, and visualization platform designed to work with ChatGPT.

A user maintains their profile once, grants specific permissions, and asks ChatGPT to create or update plans and tracking data. ChatGPT performs the reasoning and calls Plaivra tools. Plaivra stores the confirmed structured result and makes it usable through premium web and future native interfaces.

## Product model

```text
User maintains Plaivra context
→ connects Plaivra to ChatGPT
→ grants task-specific read/write permissions
→ asks for advice or an action
→ ChatGPT reads minimum authorized context
→ ChatGPT calls Plaivra tools when execution is requested
→ Plaivra stores, visualizes, tracks, edits, and corrects the result
```

Plaivra does not independently generate workout or meal plans, diagnose medical conditions, or require a normal copy/import/review queue after successful ChatGPT tool execution.

Direct controls remain important for real-world execution and correction: workout sets, completion, food logs, hydration, tasks, habits, supplements, targets, edits, deletion, export, and privacy controls.

## Authoritative documentation

Read in this order:

1. `docs/product/PLAIVRA_PRODUCT_CONSTITUTION.md`
2. `docs/product/PLAIVRA_LONG_TERM_PRODUCT_AND_PLATFORM_PLAN.md`
3. `docs/product/ai-first-tracker-model.md`
4. `docs/design-system/PLAIVRA_CROSS_PLATFORM_UI_CONSTITUTION.md`
5. `docs/design-system/platforms/web.md`
6. `docs/design-system/platforms/ios.md`
7. `docs/design-system/platforms/android.md`
8. `docs/chatgpt-app/README.md`
9. `docs/chatgpt-app/cimd-authentication-architecture.md`
10. `docs/architecture/canonical-domain-model.md`
11. `docs/platform-roadmap/README.md`

Audit reports, completed prompts, progress trackers, and old status files are not product authority.

## Current stack

- Next.js App Router
- React and TypeScript
- Tailwind CSS/design tokens
- Supabase Auth, PostgreSQL, RLS, and Storage
- MCP server and OAuth account connection
- Vitest and project checks from `package.json`

## Repository areas

- `app/` — product routes and server/API endpoints
- `components/` — reusable UI and domain components
- `lib/` — auth, MCP, privacy, security, validation, and shared helpers
- `services/` — domain service and database boundaries
- `types/` — shared application/database contracts
- `supabase/migrations/` — current immutable migration chain
- `docs/` — current product, platform, design, and architecture authority
- `.agents/` — optional Codex/Ruflo skills

## Core product domains

- persistent profile and onboarding context
- AI permission and consent management
- workout plans and workout execution
- food logs, nutrition targets, and meal plans
- grocery planning
- hydration
- progress and body measurements
- sleep/recovery, habits, tasks, supplements, and personal records
- account, privacy, export, deletion, and integration revocation

## ChatGPT application direction

The public ChatGPT application will use:

- a curated public MCP tool allowlist
- task-specific context projections rather than a broad full-profile response
- CIMD-based OAuth client identification
- Plaivra-branded login and consent
- server-side scope, ownership, permission, resource, expiry, and revocation enforcement
- explicit output schemas and production tests for every public tool

The final connection experience must not require users to copy a client ID, connection UUID, or bearer token.

## Cross-platform direction

Delivery order:

1. premium web product
2. public ChatGPT app
3. unified entitlement service and web subscription
4. iOS
5. Android

Web, iOS, and Android share product rules, domain contracts, permissions, analytics semantics, and design tokens. Their interaction implementations remain platform-appropriate.

## Environment

Copy `.env.example` and configure only used providers.

Browser-safe variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_USE_MOCK_AUTH`
- `NEXT_PUBLIC_CHATGPT_CONNECT_URL`
- `NEXT_PUBLIC_PLAIVRA_MCP_SERVER_URL`

Server-only variables:

- `SUPABASE_SERVICE_ROLE_KEY`
- `PLAIVRA_MCP_BASE_URL`
- `PLAIVRA_MCP_TOKEN_SECRET`
- `PLAIVRA_CHATGPT_REDIRECT_URIS`
- `PLAIVRA_CIMD_ALLOWED_ORIGINS`
- `CRON_SECRET`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

Never commit real secrets or production tokens.

## Supabase migrations

The production project currently reports the applied migration identities below. Applied migrations are immutable; future schema changes must be new migrations. The checked-in reconciliation authority, including version aliases, drift, and pending files, is [`supabase/migration-ledger.json`](supabase/migration-ledger.json) and [`docs/architecture/migration-ledger-reconciliation.md`](docs/architecture/migration-ledger-reconciliation.md).

1. `202606290000_clean_initial_schema`
2. `202606290001_security_privacy_mcp_hardening`
3. `202606290002_seed_reference_data`
4. `20260701053859_mcp_security_launch_blockers`
5. `20260701063223_mcp_oauth_hardening`
6. `20260702062000_phase6_consent_types`
7. `20260702120000_mcp_service_role_permissions`
8. `20260702124724_fix_chatgpt_connection_rotation_ambiguous_columns`
9. `20260702174951_chatgpt_execution_layer_foundation`
10. `20260702181448_execution_layer_reference_ownership_hardening`
11. `20260710140133_functional_fitness_constraints` (repository file: `20260710135000_functional_fitness_constraints.sql`)
12. `20260710145503_drop_retired_ai_request_and_safety_tables` (repository file: `20260710170000_drop_retired_ai_request_and_safety_tables.sql`)

The schema effects associated with `20260703151807_onboarding_coaching_quick_log_preferences.sql` exist in production but its version is absent from the production ledger. Do not repair or replay it without original application evidence. Run `npm run migration:ledger:check` for repository classification; it does not claim live production parity.

Do not run pre-clean-rebuild migrations against the current project.

## Local development

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run build
```

Run the exact scripts available in `package.json`; do not invent missing commands.

## Release integrity

Public launches require the reviewed commit to match the deployed commit, all repository quality gates to pass, a successful provider deployment, and post-deploy smoke evidence. See [`docs/release/README.md`](docs/release/README.md) for the version endpoint, release manifest, required gates, and release procedure.

## Safety and privacy

Plaivra is a general fitness context and tracking product. It does not diagnose, treat, prescribe, or replace qualified medical care.

Plaivra stores user-provided account, profile, preference, plan, tracking, progress, consent, and operational data. ChatGPT access is permissioned, task-specific, revocable, and subject to data minimization.
