# Plaivra Long-Term Product and Platform Plan

**Version:** 2026.4  
**Status:** Strategic source of truth  
**Time horizon:** Multi-year

## Mission

Build Plaivra into a globally credible personal fitness context and execution platform that makes ChatGPT-created plans persistent, structured, permissioned, editable, visual, and useful across web, ChatGPT, iOS, and Android.

## Target experience

Plaivra stores user-maintained fitness and nutrition context once. ChatGPT receives only the authorized task-specific projection, asks only for essential missing information, reasons about the request, and writes confirmed structured results through Plaivra tools. Plaivra then tracks, visualizes, edits, corrects, exports, and deletes those records.

Plaivra is not a second reasoning engine and does not add a copy/import/review queue after successful tool execution.

## Shared platform architecture

All clients share:

- Supabase-backed account and data platform;
- domain types, validation, and ownership rules;
- task-specific context and permission contracts;
- MCP/API contracts;
- entitlement semantics;
- analytics meaning;
- design tokens and accessibility outcomes.

Client surfaces remain platform appropriate:

- **Web:** active Next.js reference product and administration surface;
- **ChatGPT:** curated MCP tools with OAuth/CIMD account connection;
- **iOS:** future native-feeling client using shared contracts and Apple behavior;
- **Android:** future native-feeling client using shared contracts and Android behavior.

## Persistent Context Service

Public ChatGPT access uses versioned task-specific projections rather than broad profile reads. Projection families include training planning, nutrition planning, workout adjustment, meal preparation, daily execution, progress summary, and available capabilities.

Every projection defines purpose, included/excluded fields, permission scope, sensitivity, output schema, maximum size, audit behavior, version, and tests.

## Public ChatGPT architecture

The public catalog is an explicit allowlist covering connection/capabilities, task-specific context, user-owned plans/logs/targets, daily execution, progress, correction, and deletion.

Exclude admin tools, deprecated aliases, internal workflow state, broad exports, detailed clinical profile tools, and untested experiments.

Every public tool requires strict input/output schemas, OAuth requirements, annotations, bounded structured output, ownership enforcement, stable errors, and positive/negative tests.

Users must never copy a connection UUID, client ID, or bearer token. Plaivra owns branded login, consent, permissions, connection management, and revocation. CIMD/OAuth infrastructure is implemented; final production configuration and platform publication remain separate acceptance gates.

## Canonical data architecture

Applied migrations are immutable. Convergence happens domain by domain:

```text
add canonical model
→ migrate or backfill data
→ update writes
→ retain bounded compatibility reads where required
→ verify ownership, privacy, and behavior
→ remove old reads
→ monitor
→ drop deprecated objects in a later migration
```

Accepted ADRs currently cover performed sessions, exercise catalog, saved nutrition content, the multi-week program hierarchy, and Muscle Intelligence taxonomy/mapping authority. These decisions are implemented at different stages; accepted architecture does not imply every writer cutover is complete.

## Status matrix

| Workstream | Status |
|---|---|
| Product/design authority | Implemented |
| Repository hygiene and current documentation | Active cleanup, then maintained continuously |
| Obsolete AI request/safety workflow | Removed |
| Task-specific context projections | Implemented foundation; public launch acceptance incomplete |
| Curated MCP, permissions, idempotency, audit | Implemented foundation; platform publication incomplete |
| CIMD/OAuth | Implemented infrastructure; final external configuration/review incomplete |
| Canonical performed-session decision | Accepted; compatibility linking/cutover remains |
| Canonical exercise decision | Accepted; legacy compatibility sources remain |
| Canonical saved-recipe decision | Accepted; legacy custom-meal convergence remains |
| Train Phase 2A hierarchy | Applied; runtime writer cutover remains |
| Muscle Intelligence Phase 1 | Applied and merged; trusted mapping registry and UI remain future phases |
| Entitlement service | Provider-neutral foundation exists; checkout/offering activation future |
| Product Constitution Lock | Not yet declared |
| iOS and Android | Future; no binary exists |

## Privacy and safety

Every field is classified by purpose, sensitivity, storage, consent/legal basis where required, retention, export, deletion, processors, ChatGPT access, and audit rules.

Public ChatGPT uses functional user-authored constraints rather than detailed clinical records. Plaivra does not diagnose, treat, prescribe, or replace professional care.

Destructive operations require explicit confirmation and server-side ownership, permission, token, connection, and revocation enforcement.

## Subscription architecture

Provider events normalize into one Plaivra entitlement boundary:

```text
verified Stripe / Apple / Google event
→ provider-neutral entitlement record
→ capability check
```

Plaivra does not store raw payment credentials or collect card data through MCP. Checkout remains disabled until offerings, recovery behavior, provider configuration, and release gates are approved.

## Delivery roadmap

1. finish web stabilization, repository hygiene, and current architecture documentation;
2. complete task-specific context and public MCP/CIMD production acceptance;
3. complete staged Train and canonical-data cutovers;
4. continue Muscle Intelligence phases without bypassing trusted mapping and historical-version gates;
5. declare Product Constitution Lock after core P0/P1 closure;
6. activate provider-neutral web entitlements and Stripe;
7. build and test iOS;
8. adapt and test Android.

## World-class quality gates

Plaivra is launch-ready only when the product is explainable, task context is minimized, tool writes are reliable and idempotent, every generated record is correctable, destructive actions are unambiguous, privacy/export/deletion/revocation work, logs are redacted, high-impact security/performance findings are resolved or explicitly accepted, and reviewed code, deployed code, migration history, configuration, and submission evidence match exactly.

## Governance

Before Product Constitution Lock, evidence-backed changes may update this plan and dependent architecture documents together. After lock, broad changes require a formal Product Change Proposal.
