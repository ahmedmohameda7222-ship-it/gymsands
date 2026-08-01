# Plaivra

Plaivra is a user-controlled fitness context, execution, tracking, history, and visualization platform designed to work with ChatGPT.

```text
User maintains Plaivra context
-> grants task-specific access
-> ChatGPT reads the minimum authorized context
-> Plaivra executes authorized tools
-> the user reviews, tracks, corrects, exports, or deletes the result
```

Plaivra does not independently invent workout or meal plans, diagnose medical conditions, or create a duplicate AI approval queue after successful authorized tool execution.

## Authoritative documentation

Read current authority in this order:

1. `docs/product/PLAIVRA_PRODUCT_CONSTITUTION.md`
2. `docs/product/PLAIVRA_LONG_TERM_PRODUCT_AND_PLATFORM_PLAN.md`
3. `docs/product/ai-first-tracker-model.md`
4. `docs/design-system/PLAIVRA_CROSS_PLATFORM_UI_CONSTITUTION.md`
5. `docs/chatgpt-app/README.md`
6. `docs/chatgpt-app/cimd-authentication-architecture.md`
7. `docs/architecture/canonical-domain-model.md`
8. `docs/architecture/migration-ledger-reconciliation.md`
9. `docs/platform-roadmap/README.md`
10. `docs/release/README.md`

Only current product, architecture, privacy, operations, release, and design authority belongs in `docs/`. Merged pull requests, Git history, and GitHub Actions artifacts preserve implementation evidence. Completed implementation reports, branch handoffs, audit snapshots, generated screenshots, one-off reconciliation pointers, and redundant prose contracts must not remain in the active repository tree.

Tests enforce source code, schema, SQL verification, structured manifests, and other machine-readable contracts. Normal Markdown wording is explanatory authority, not executable test input.

## Current stack

- Next.js App Router, React, TypeScript, and Tailwind
- Supabase Auth, PostgreSQL, RLS, Storage, and immutable migrations
- MCP with OAuth/CIMD, scoped context projections, permissions, idempotency, and audit
- Vitest, Node test runner, Playwright, and exact-head release gates
- Node.js 24.x with the committed npm lockfile

## Current architecture status

- Web is the active product surface; native applications remain future work.
- Train Phase 2A provides the additive multi-week program hierarchy while compatibility writers remain bounded until later cutover.
- Muscle Intelligence uses the approved 60-exercise registry, V1/V2 mapping authorities, advanced visible atlas, deterministic analysis, immutable session snapshots, and V2 runtime cutover.
- Active Workout AW-1 establishes EN/DE/AR language contracts.
- AW-2 provides persisted execution state, command authority, idempotency receipts, and durable timeline events.
- AW-3A provides structured performed metrics; AW-3B provides structured set details; AW-3C provides immutable normalized prescription snapshots and deterministic frozen hydration.
- AW-4 provides the shared deterministic session engine, serialized command dispatcher, official Active Workout store, and timestamp-projected timer engine. AW-4 is merged; its Production migration was applied exactly once.
- AW-8 provides derived metrics; AW-9 provides offline and multi-device controller authority; AW-10 closes the Active Workout QA/QC matrix.
- Plaivra Production contains 76 physical migration records. The ledger classifies 63 exact applications and 13 generated-version aliases, with zero pending, schema-untracked, or unresolved migrations.
- The released compatibility marker remains `20260724232734`. Physical migration advancement and application-release promotion remain separate operations.
- Repository state alone does not authorize merge, manual deployment, or compatibility-marker promotion.

## Repository areas

- `app/` — routes and API endpoints
- `components/` — UI and domain components
- `lib/` — auth, MCP, privacy, security, validation, release, and shared helpers
- `services/` — domain and database boundaries
- `types/` — shared contracts
- `supabase/migrations/` — immutable migration chain
- `supabase/verification/` — executable database verification
- `docs/` — current product, architecture, operations, release, and design authority
- `.codex/` and `.agents/` — implementation assistance, not runtime product code

Applied migrations must never be renamed, rewritten, reordered, deleted, or replayed. Generated QA evidence belongs in workflow artifacts, not permanent source files.

### AW-9 Production migration

`20260731090000_active_workout_aw9_offline_multi_device.sql` was applied exactly once to Supabase Production as generated migration `20260801045628_active_workout_aw9_offline_multi_device`. The immutable repository SQL remains unchanged. The Production compatibility marker remains `20260724232734`; do not replay applied migrations.
