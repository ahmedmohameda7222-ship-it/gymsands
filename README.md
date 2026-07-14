# Plaivra

Plaivra is a private workout, meal, and progress tracking application built with Next.js and Supabase.

## Product model

Plaivra treats the application and the ChatGPT experience as two interfaces over the same private health and fitness account. The canonical product, data, safety, privacy, platform, and design-system constraints are documented in:

- [`docs/product/PLAIVRA_PRODUCT_CONSTITUTION.md`](docs/product/PLAIVRA_PRODUCT_CONSTITUTION.md)
- [`docs/product/PLAIVRA_LONG_TERM_PRODUCT_AND_PLATFORM_PLAN.md`](docs/product/PLAIVRA_LONG_TERM_PRODUCT_AND_PLATFORM_PLAN.md)
- [`docs/design-system/PLAIVRA_CROSS_PLATFORM_UI_CONSTITUTION.md`](docs/design-system/PLAIVRA_CROSS_PLATFORM_UI_CONSTITUTION.md)
- [`docs/design-system/platforms/web.md`](docs/design-system/platforms/web.md)
- [`docs/design-system/platforms/ios.md`](docs/design-system/platforms/ios.md)
- [`docs/design-system/platforms/android.md`](docs/design-system/platforms/android.md)
- [`docs/chatgpt-app/README.md`](docs/chatgpt-app/README.md)
- [`docs/architecture/canonical-domain-model.md`](docs/architecture/canonical-domain-model.md)

## Stack

- Next.js 16 / React 19
- TypeScript
- Tailwind CSS
- Supabase Auth, Postgres, RLS, Storage, and Edge Functions
- Vitest, Node test runner, and Playwright

## Repository layout

- `app/` — Next.js routes and API handlers
- `components/` — application UI
- `lib/` — domain logic, release controls, MCP, and shared utilities
- `services/` — data and integration services
- `supabase/` — migrations, local configuration, functions, and verification SQL
- `scripts/` — repository, release, environment, smoke, and QA tooling
- `docs/` — architecture, product, release, privacy, legal, and design-system authority

## Environment

Copy `.env.example` to `.env.local` for local development. Production validation requires the variables documented in `.env.example`, including:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_USE_MOCK_AUTH`
- `PLAIVRA_MCP_BASE_URL`
- `PLAIVRA_MCP_TOKEN_SECRET`
- `PLAIVRA_CHATGPT_REDIRECT_URIS`
- `PLAIVRA_CIMD_ALLOWED_ORIGINS`
- `PLAIVRA_OAUTH_ISSUER`
- `CRON_SECRET`

Optional provider variables are documented in `.env.example`, including:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRO_MONTHLY_PRICE_ID`
- `STRIPE_PRO_YEARLY_PRICE_ID`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

Never commit real secrets or production tokens.

## Supabase migrations

The machine-readable authority is [`supabase/migration-ledger.json`](supabase/migration-ledger.json). The human reconciliation record is [`docs/architecture/migration-ledger-reconciliation.md`](docs/architecture/migration-ledger-reconciliation.md).

Verified read-only on 2026-07-14:

- Supabase migration history contains 24 normally applied migrations through `20260711014500_idempotency_uncertain_completion_guard`.
- Seven later migrations are physically present but absent from Supabase migration history:
  - `20260711213000_adaptive_onboarding_v2.sql`
  - `20260712173000_persistent_meal_plan_skip_status.sql`
  - `20260712195000_nutrition_target_date_overrides.sql`
  - `20260713153000_meal_plan_atomic_execution.sql`
  - `20260713160000_train_section_atomic_integrity.sql`
  - `20260713170000_finalize_train_schedule_delete_integrity.sql`
  - `20260714030000_harden_train_plan_rpc_execution.sql`
- The nutrition override table currently has excess authenticated privileges in production.
- `20260715010000_restrict_nutrition_target_override_acl.sql` is a pending forward-only correction and has not been applied.
- Current counts are `pendingCount=1`, `schemaAppliedUntrackedCount=7`, and `unresolvedCount=8`.
- Migration-history reconciliation remains **pending** and release readiness remains false.

Do not replay schema-untracked migrations. Do not use an ambiguous remote migration push while the seven identities are absent from history. Apply the forward correction and repair history only through separately approved, evidence-backed, supported Supabase operations. Run `npm run migration:ledger:check` to validate repository classification, counts, and documentation consistency.

Do not run pre-clean-rebuild migrations against the current project.

## Local development

Use Node.js 24.x as declared by `package.json`, `.nvmrc`, and `.node-version`.

```bash
npm ci
npm run lint
npm run typecheck
npm run test:unit
npm run test:scripts
npm run build
```

Start the application with:

```bash
npm run dev
```

For the disposable Supabase stack:

```bash
supabase db start
supabase db reset --local --no-seed
supabase db lint --local --schema public --level error --fail-on error
```

## Quality and release controls

The `Quality` workflow performs an exact-SHA checkout and exercises:

- complete disposable migration chain;
- database lint and release preflight SQL;
- repository integrity;
- migration-ledger validation;
- dependency audit;
- lint, typecheck, unit, integration, telemetry, and script tests;
- production environment validation;
- built release metadata verification;
- production build;
- rendered browser QA;
- release-manifest generation;
- fail-closed release preflight.

`npm run release:preflight` is expected to fail with `migration_ledger_not_reconciled` while any migration is pending or otherwise unresolved. A provider deployment state alone is not release acceptance.

## Security and privacy

- Row-level security is the primary owner-isolation boundary.
- Browser-writable privileged operations use narrow, ownership-checked RPCs.
- Service credentials remain server-only.
- Health and fitness content must not be written to logs or release evidence.
- Production schema and migration-history changes require reviewed migrations or supported metadata repair; direct internal-table edits are prohibited.

## License

Private repository. All rights reserved.
