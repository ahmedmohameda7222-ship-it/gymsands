# Plaivra Platform Roadmap

**Version:** 2026.4  
**Authority:** subordinate to the Product Constitution and Long-Term Plan

## Strategic sequence

1. stable premium responsive web product;
2. public ChatGPT app using curated MCP and CIMD/OAuth;
3. Product Constitution Lock;
4. provider-neutral entitlements and web subscription;
5. iOS;
6. Android.

The existing Next.js repository remains the main product repository. Native work must wait for stable product, data, permission, API, analytics, and design contracts.

## Current implementation status

| Capability | Status |
|---|---|
| Product and cross-platform constitutions | Implemented as current authority |
| Repository/documentation reset | Active cleanup; generated and historical evidence is being removed from the source tree |
| Obsolete AI request/safety workflow | Removed from active runtime and database |
| Canonical domain ADRs | ADRs 0001–0005 accepted |
| Premium web routes | Active; continued stabilization and accessibility/performance work required |
| Context Projection Service | Implemented for task-specific contexts; public launch acceptance remains incomplete |
| Public MCP catalog and execution | Implemented foundation with typed contracts, permissions, idempotency, and tests; platform publication remains incomplete |
| CIMD/OAuth | Infrastructure implemented; final production configuration and platform review remain |
| Train Phase 2A | Additive multi-week hierarchy applied; writer/runtime cutover remains future work |
| Muscle Intelligence | Phase 1 foundation applied and merged; trusted mapping registry and UI phases remain |
| Entitlements/billing | Provider-neutral database/service foundation exists; checkout and offerings remain disabled |
| iOS/Android | Planning only; no native binary |

## Shared versus platform-specific

Share product/domain rules, validation, permission contracts, entitlement semantics, API/MCP contracts, analytics meaning, design tokens, and accessibility outcomes.

Do not blindly share DOM components, desktop assumptions, browser navigation, hover behavior, web dialogs, native system controls, billing UX, or platform permission flows.

## Next active priorities

1. complete repository cleanup and regenerate the repository graph from clean `main`;
2. continue Muscle Intelligence with the approved trusted exercise-mapping phase;
3. complete remaining Train Phase 2 projection/writer/cutover work in controlled phases;
4. finish public MCP/CIMD production configuration, acceptance, and submission evidence;
5. stabilize web performance, accessibility, error states, and release observability;
6. declare Product Constitution Lock only after core P0/P1 gates close;
7. approve offerings and activate provider-neutral entitlements/web billing;
8. begin iOS, then Android, from stable shared contracts.

## Native direction

When native development begins, prefer a deliberate monorepo shape with web, mobile, core contracts, API client, validation, design tokens, and analytics contracts. Expo/React Native remains the default shared mobile direction unless evidence justifies separate native implementations.

## Global quality rule

A feature is cross-platform-ready only when it has one domain contract, permission model, analytics meaning, migration strategy, semantic design rule set, platform adaptations, and appropriate tests. Do not ship three inconsistent Plaivra products.
