# Plaivra Codex Context Manifest

> Generated: `2026-07-29T15:37:00+02:00`  
> Repository: `ahmedmohameda7222-ship-it/gymsands`  
> Audited application base: `main@2169527efc3c2cd4210fc358a58c6bce37f1788b`  
> Active-work overlay: `PR #90@e4cfca2f909912fa3041cebaf5689944dc655339`  
> Freshness: compare repository trees from the audited application base, excluding context-only paths. Exact source, migrations, tests, and workflows remain executable truth.

## Purpose

This directory is the durable repository-intelligence base for Codex and other coding agents. It reduces repeated repository-wide discovery by recording stable product authority, architecture, ownership, database contracts, release rules, high-value entry points, and active unmerged overlays.

It is **not** a substitute for reading the exact current source that will be edited. It is a navigation and decision layer.

## Mandatory startup

Before any Plaivra code task:

1. Read this file.
2. Read `09_CODEX_STARTUP_AND_REFRESH_PROTOCOL.md`.
3. Read only the domain context files relevant to the task.
4. Compare the current repository tree with `context_manifest.json` using its audited application base and context-only exclusions.
5. Check the active PR/head identity when an overlay is relevant.
6. Read the exact current files and symbols to be changed.
7. Inspect only dependencies exposed by imports, references, tests, migrations, security boundaries, or the task prompt.
8. After a meaningful architecture, schema, workflow, authority, or phase-state change, update the affected context files and manifest in the same PR.

## Freshness model

The recorded SHA is an **audited application-source snapshot**, not a self-referential claim that it equals the commit containing this manifest.

When checking freshness, compare that SHA with the current target tree and ignore changes limited to:

```text
AGENTS.md
docs/codex-context/**
```

If all non-context paths are unchanged, the application context remains fresh even after this Knowledge Base PR is merged.

For future implementation work, refresh context in a final context-only commit and point `auditedApplicationBase.sha` to the immediately preceding implementation/source-state commit. Tree comparison remains valid even if GitHub later squash-merges the PR.

## Authority order

The repository's product and architecture authority remains:

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
11. current executable source, SQL verification, tests, and workflows for implementation truth.

This context base summarizes and indexes those authorities; it does not outrank them.

## Context files

| File | Read when |
|---|---|
| `01_PRODUCT_AND_AUTHORITY.md` | Product intent, non-goals, authority conflicts |
| `02_REPOSITORY_ARCHITECTURE.md` | Stack, layers, state, service and test ownership |
| `03_DOMAIN_AND_ROUTE_MAP.md` | Finding a product domain or route |
| `04_DATABASE_SECURITY_AND_MIGRATIONS.md` | Supabase, SQL, RLS, RPC, migration or privacy work |
| `05_ACTIVE_WORKOUT_AND_MUSCLE_INTELLIGENCE.md` | Workout execution, prescriptions, metrics, heat maps |
| `06_CI_RELEASE_AND_OPERATIONS.md` | Workflows, artifacts, merge, release or deploy work |
| `07_FILE_AND_SYMBOL_INDEX.md` | Fast path from concern to source/tests |
| `08_DECISIONS_RISKS_AND_BOUNDARIES.md` | Approved boundaries, current risks and no-go areas |
| `09_CODEX_STARTUP_AND_REFRESH_PROTOCOL.md` | Every task start; context maintenance |
| `active-work/pr-90-aw5-overlay.md` | Only when PR #90/AW-5 is relevant |
| `context_manifest.json` | Machine-readable freshness and routing data |

## Snapshot status

- Canonical branch: `main`
- Audited application-base SHA: `2169527efc3c2cd4210fc358a58c6bce37f1788b`
- Active unmerged work: PR #90, branch `feat/active-workout-aw5-ui-core`
- Active-work SHA: `e4cfca2f909912fa3041cebaf5689944dc655339`
- Current merged Active Workout phase: AW-4
- Current unmerged implementation phase: AW-5 UI Core
- Plaivra Production migration records: 75
- Latest Production migration: `20260726114212`
- Released schema compatibility marker: version `2`, migration `20260724232734`
- Activity Catalog: separate Supabase project and separate data authority

## Limits

- This snapshot does not contain private environment values, user row data, generated QA evidence, or complete source copies.
- Supabase Advisor findings are recorded as review signals, not automatically as defects.
- The active-work overlay is non-canonical until merged.
- Any mismatch with current source or authoritative docs must be resolved in favor of current executable truth and then reflected here.
