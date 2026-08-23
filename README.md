# Plaivra

Plaivra is a user-controlled persistent fitness context, execution, tracking, history, and visualization platform designed to work with ChatGPT.

**Core model:** ChatGPT reasons and acts through authorized tools; Plaivra stores, executes, tracks, visualizes, corrects, exports, and protects the resulting structured user-owned state.

## Start here

Repository work must begin with the control plane:

1. [`docs/product/PLAIVRA_PRODUCT_CONSTITUTION.md`](docs/product/PLAIVRA_PRODUCT_CONSTITUTION.md)
2. [`docs/control/README.md`](docs/control/README.md)
3. [`docs/control/PLAIVRA_MASTER_PLAN.md`](docs/control/PLAIVRA_MASTER_PLAN.md)
4. [`docs/control/PLAIVRA_CURRENT_STATE.md`](docs/control/PLAIVRA_CURRENT_STATE.md)
5. [`docs/control/PLAIVRA_ARCHITECTURE_AUTHORITIES.md`](docs/control/PLAIVRA_ARCHITECTURE_AUTHORITIES.md)
6. [`docs/control/PLAIVRA_DELIVERY_RULES.md`](docs/control/PLAIVRA_DELIVERY_RULES.md)

Historical PRs, completed phase reports, generated QA evidence, and old implementation handoffs are not active repository authority. Git history, pull requests, CI artifacts, immutable migrations, and Production evidence preserve history without keeping obsolete evidence in the working tree.

## Product and platform authorities

- Product: [`docs/product/`](docs/product/)
- Cross-platform UI: [`docs/design-system/`](docs/design-system/)
- Canonical data model: [`docs/architecture/canonical-domain-model.md`](docs/architecture/canonical-domain-model.md)
- ChatGPT integration: [`docs/chatgpt-app/`](docs/chatgpt-app/)
- Native readiness: [`docs/native-readiness/`](docs/native-readiness/)
- Operations: [`docs/operations/`](docs/operations/)
- Release controls: [`docs/release/`](docs/release/)
- Migration authority: [`supabase/migration-ledger.json`](supabase/migration-ledger.json) and immutable [`supabase/migrations/`](supabase/migrations/)

## Repository structure

- `app/` — Next.js routes and API composition
- `components/` — presentation and interaction surfaces
- `lib/` — contracts, domain logic, engines, projections, identity, MCP and shared platform code
- `services/` — domain/service/data boundaries
- `data/` and `assets/` — executable product data and approved runtime/build assets
- `supabase/` — schema, immutable migrations, verification and migration ledger
- `scripts/` — current CI, release, database, QA and build tooling
- `.github/workflows/` — current automated gates and operational workflows

## Development

Node.js 24 is the repository runtime baseline.

```bash
npm ci
npm run dev
```

Primary local validation:

```bash
npm run lint
npm run typecheck
npm run test:scripts
npm run test:unit
npm run build
```

Use the narrower domain suites when the changed scope requires them. The CI change-scope authority determines the complete required gate set for pull requests.

## Non-negotiable repository rules

- Do not create a second source of truth for an existing domain.
- Do not rewrite applied migrations; use additive forward fixes.
- Do not commit generated QA reports, screenshots, temporary evidence, local agent frameworks, or completed phase handoffs.
- Do not claim a Production write, deployment, migration, or merge that has not been explicitly authorized and verified.
- Preserve owner scoping, RLS, privacy/export/deletion behavior, authentication boundaries, and structured ChatGPT permission contracts.
- Web-specific implementation details must not become cross-platform product contracts.

See [`AGENTS.md`](AGENTS.md) for executor behavior and [`docs/control/PLAIVRA_DELIVERY_RULES.md`](docs/control/PLAIVRA_DELIVERY_RULES.md) for delivery policy.
