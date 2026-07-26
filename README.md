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

Merged pull requests, Git history, and GitHub Actions artifacts preserve implementation evidence. Completed implementation reports, branch handoffs, audit snapshots, generated screenshots, and one-off reconciliation pointers are not active source authority and must not remain in the repository tree.

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
- Plaivra Production contains 74 physical migration records. The ledger classifies 63 exact applications and 11 generated-version aliases, with zero pending, schema-untracked, or unresolved entries.
- The released compatibility marker remains `20260724232734`. Physical migration advancement and application-release promotion remain separate operations.
- PR #86 remains the unmerged AW-3C release candidate. No manual deployment, compatibility-marker promotion, or AW-4 work is authorized by repository state alone.

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
