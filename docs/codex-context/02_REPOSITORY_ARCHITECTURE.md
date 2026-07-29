# Repository Architecture

> Generated: `2026-07-29T15:37:00+02:00`
> Repository: `ahmedmohameda7222-ship-it/gymsands`
> Canonical base: `main@2169527efc3c2cd4210fc358a58c6bce37f1788b`
> Active-work overlay: `PR #90@e4cfca2f909912fa3041cebaf5689944dc655339`
> Freshness: verify the manifest and Git diff before relying on this snapshot. Exact source, migrations, tests, and workflows remain executable truth.

## Stack snapshot

- Node.js 24.x; npm lockfile is committed.
- Next.js 16.2.11 App Router.
- React / React DOM 19.2.
- TypeScript 5.9.
- Tailwind CSS 3.4 with shared UI components and tokens.
- Supabase Auth/PostgreSQL/RLS/Storage through `@supabase/ssr` and `@supabase/supabase-js`.
- `next-intl` with EN/DE/AR and RTL-sensitive UI contracts.
- MCP/OAuth/CIMD with scoped context projections, permissions, idempotency and audit.
- Vitest unit/integration tests, Node script tests and Playwright rendered QA.
- Vercel is the main Git-connected production deployment path; Netlify remains separate.

## Top-level ownership

| Area | Ownership |
|---|---|
| `app/` | App Router pages, layouts and API endpoints |
| `components/` | Shared UI, layout and product-domain components |
| `lib/` | Auth, MCP, privacy, security, validation, release and pure/shared logic |
| `services/` | Domain operations and database boundaries |
| `types/` | Shared application/database contracts |
| `supabase/migrations/` | Immutable schema history |
| `supabase/verification/` | Executable SQL verification |
| `scripts/` | CI, release, migration, QA and repository checks |
| `messages/` | EN/DE/AR message catalogs |
| `docs/` | Current product, architecture, design, operations and release authority |
| `.codex/`, `.agents/` | Agent assistance; never runtime product authority |
| `.github/workflows/` | Exact CI/release orchestration |

## Layer model

```text
App Router page/layout/API
→ domain component or route handler
→ domain/service boundary
→ Supabase client or atomic RPC
→ owner-bound PostgreSQL tables
```

Shared pure logic belongs in `lib/`; database and external side effects belong behind `services/` or route handlers. Public MCP tools call curated domain services rather than arbitrary tables.

## State model

Use the smallest correct state authority:

- request and route state: App Router and server/client component boundary;
- durable domain state: PostgreSQL;
- mutation invariants: RLS, grants, constraints and atomic RPCs;
- client execution state: one official identity-scoped store where a domain defines one;
- derived presentation state: pure selectors/view models;
- ephemeral UI state: local component state;
- compatibility state: bounded, named, tested and removable only with dependency proof.

Do not create a second durable root or duplicate writer for convenience.

## Internationalization and layout

- Messages live in `messages/en.json`, `messages/de.json`, `messages/ar.json`.
- Domain message contracts and shape tests live under `lib/i18n/`.
- Arabic is a first-class RTL surface.
- Cross-platform layout authority is `docs/design-system/PLAIVRA_CROSS_PLATFORM_UI_CONSTITUTION.md`.
- Rendered UI claims require actual browser evidence; source-string tests are not visual proof.

## Error and security boundaries

- Validate environment through `lib/env.ts` and `scripts/validate-production-env.mjs`.
- User-facing mutation errors must map from stable domain/database errors.
- Do not expose service-role credentials to clients.
- Public MCP requests require token, resource, scope, permission, active-connection, expiry and revocation checks.
- Privacy export/deletion must track every canonical owned child relation.

## Test architecture

| Layer | Main tools |
|---|---|
| Pure/domain behavior | Vitest unit tests |
| Database/service behavior | Vitest integration tests against disposable/local Supabase |
| Repository/CI contracts | Node test runner under `scripts/*.test.mjs` |
| SQL invariants | `supabase/verification/` plus migration replay and DB lint |
| i18n | message shape and surface contract tests |
| UI behavior/layout | React tests plus Playwright rendered QA |
| Release identity | release manifest, metadata, artifact and preflight scripts |

Always prefer behavior tests over tests that only search source text.
