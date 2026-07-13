# Plaivra Platform Roadmap

**Version:** 2026.2
**Status:** Strategic source of truth
**Authority:** Subordinate to the Product Constitution and Long-Term Plan

## 1. Platform sequence

Plaivra will be delivered in this order:

1. premium and stable responsive web application;
2. public ChatGPT app using MCP and CIMD;
3. unified entitlement service and web subscription;
4. iOS application;
5. Android application.

The order is deliberate. Native applications must be built on stable product, data, permission, and design contracts rather than duplicating an unfinished web product.

## 2. Repository strategy

Current phase:

- keep the existing Next.js repository as the main product repository;
- separate domain logic, validation, permissions, API access, and UI semantics from route components;
- avoid creating independent iOS and Android repositories now.

When native development begins, migrate deliberately toward a monorepo shape:

```text
apps/
  web/
  mobile/
packages/
  core/
  api-client/
  design-tokens/
  validation/
  analytics-contracts/
```

One Expo/React Native mobile foundation is the default direction for iOS and Android unless later evidence justifies separate native implementations.

## 3. Shared versus platform-specific

Share:

- product and domain rules;
- validation schemas;
- context and permission contracts;
- entitlement logic;
- API/MCP contracts;
- analytics semantics;
- design tokens;
- accessibility outcomes;
- copy where appropriate.

Do not blindly share:

- exact React DOM components;
- desktop layout assumptions;
- browser-only navigation;
- hover interactions;
- web modals;
- iOS/Android system controls;
- platform billing and permission UX.

Use `docs/design-system/PLAIVRA_CROSS_PLATFORM_UI_CONSTITUTION.md` and its platform files.

## 4. Phase 1 — Web product foundation

Required outcomes:

- Product Constitution implemented;
- persistent profile and context model stable;
- core Today, Train, Eat, Progress, and Account flows stable;
- loading, empty, error, pending, success, offline, and revoked states covered;
- domain services separated from UI where practical;
- mobile-web and desktop rendered QA passes;
- authentication, privacy, export, deletion, and consent flows work;
- no unresolved P0 and no high-impact core-flow P1.

## 5. Phase 2 — ChatGPT application

Required outcomes:

- task-specific Context Projection Service;
- curated public MCP allowlist;
- explicit input/output schemas;
- CIMD-based client identification;
- Plaivra-branded login and consent;
- no copied client IDs/tokens;
- production OAuth, scope, ownership, revocation, retry, and idempotency tests;
- OpenAI submission package generated from the exact deployed commit.

Reference:

- `docs/chatgpt-app/README.md`
- `docs/chatgpt-app/cimd-authentication-architecture.md`

## 6. Phase 3 — Product Constitution Lock

Declare the lock only when the core product, design system, context architecture, and public ChatGPT execution model meet the acceptance gates.

After lock, broad changes require evidence and a Product Change Proposal.

## 7. Phase 4 — Unified entitlements and web billing

Create a provider-independent entitlement service.

```text
verified provider event
→ normalized Plaivra entitlement
→ capability check
```

Web provider: Stripe Billing.

Normalized states must cover trial, active, grace period, billing issue, cancellation, expiry, and revocation.

The product never checks Stripe directly to decide general capability outside the entitlement boundary.

## 8. Phase 5 — iOS

Use the stable shared domain/API/design foundation.

Required native work:

- iOS navigation and safe areas;
- Dynamic Type and VoiceOver;
- secure storage;
- OAuth/deep links;
- notifications;
- Sign in with Apple where required;
- StoreKit and entitlement synchronization;
- TestFlight testing;
- iPhone and iPad adaptive layouts.

Reference: `docs/design-system/platforms/ios.md`.

## 9. Phase 6 — Android

Adapt the shared mobile foundation for:

- Android navigation and predictive back;
- adaptive windows, tablets, and foldables;
- TalkBack and font/display scaling;
- secure storage;
- app links and notifications;
- Google sign-in where required;
- Google Play Billing and entitlement synchronization;
- staged Play testing.

Reference: `docs/design-system/platforms/android.md`.

## 10. Global quality rule

Do not ship three inconsistent Plaivra products.

A feature is cross-platform-ready when it has:

- one domain contract;
- one permission model;
- one analytics meaning;
- one data migration strategy;
- shared semantic design rules;
- documented web, iOS, and Android adaptations;
- tests appropriate to each platform.

## 11. Current priorities

1. repository/documentation reset;
2. remove obsolete AI action-request workflow;
3. decide canonical database models;
4. stabilize premium web product;
5. implement Context Projection Service;
6. implement CIMD;
7. prepare public ChatGPT MCP v1;
8. lock product constitution;
9. build entitlement service;
10. begin iOS, then Android.
