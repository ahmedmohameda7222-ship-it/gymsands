# Plaivra Long-Term Product and Platform Plan

**Version:** 2026.2
**Status:** Strategic source of truth
**Time horizon:** Multi-year

## 1. Mission

Build Plaivra into a globally credible personal fitness context and execution platform that makes ChatGPT-created plans persistent, structured, safe, editable, visual, and useful across web, ChatGPT, iOS, and Android.

## 2. User problem

A user should not repeat the same profile in every new ChatGPT conversation:

- age, height, weight, goals, experience, activity level;
- available equipment, available days, session duration;
- food preferences, dislikes, cuisines, cooking skill, cooking time;
- budget, meal frequency, kitchen equipment;
- relevant user-authored fitness constraints;
- current plans, targets, adherence, and recent progress.

Plaivra stores and maintains this context once. ChatGPT retrieves only the authorized projection needed for the current task.

## 3. Target experience

```text
User: Connect to Plaivra, check my nutrition context, and create a realistic plan for next week.

ChatGPT:
- obtains the required authorized context;
- does not repeat known questions;
- asks only for essential missing information;
- creates the plan;
- saves it with Plaivra tools;
- reports confirmed success.

Plaivra:
- displays the structured week;
- visualizes calories and macros;
- builds grocery and completion workflows;
- preserves history;
- allows correction, replacement, export, and deletion.
```

## 4. Platform architecture

### 4.1 Shared layers

All clients share:

- Supabase-backed account and data platform;
- domain types and validation;
- permission and consent rules;
- task-specific context contracts;
- MCP tool contracts;
- entitlement logic;
- analytics event semantics;
- design tokens and accessibility requirements.

### 4.2 Client layers

- **Web:** Next.js reference product and administration surface.
- **ChatGPT app:** MCP tools, OAuth/CIMD account connection, selective conversational UI.
- **iOS:** native-feeling mobile client using shared domain logic and Apple platform behavior.
- **Android:** native-feeling mobile client using shared domain logic and Android platform behavior.

The clients may not fork product rules.

## 5. Persistent Context Service

Create a versioned context-projection layer between storage and ChatGPT.

Required projections:

- `training_planning_context`;
- `nutrition_planning_context`;
- `workout_adjustment_context`;
- `meal_preparation_context`;
- `daily_execution_context`;
- `progress_summary_context`;
- `available_capabilities_context`.

Every projection must define:

- purpose;
- included fields;
- excluded fields;
- permission scope;
- sensitivity class;
- output schema;
- maximum output size;
- audit event;
- version;
- tests.

Broad profile reads are compatibility-only and must not be the normal public ChatGPT path.

## 6. Profile architecture

### Core profile

- preferred name;
- age or age range;
- height and current weight;
- preferred units;
- time zone and language;
- general fitness goal and activity level.

### Training profile

- experience;
- available days and duration;
- environment and equipment;
- preferred and avoided movements;
- training preferences;
- current active plan reference.

### Nutrition profile

- nutrition goal and targets;
- food preferences and dislikes;
- preferred cuisines;
- budget and currency;
- cooking time and skill;
- kitchen equipment;
- meal frequency and preparation preferences;
- user-provided allergies or intolerances where legally supported.

### Execution context

- current plans;
- scheduled items;
- recent completion and adherence;
- current targets;
- user-selected quick actions.

### Private and sensitive context

Private fields are not automatically ChatGPT-shareable. Public ChatGPT v1 uses functional fitness constraints instead of detailed clinical data.

## 7. ChatGPT app architecture

### 7.1 Initial public form

The first public Plaivra integration should be a curated MCP app with a small, high-quality tool catalog. Custom in-chat UI is optional and should be added only where it improves the conversation.

### 7.2 Public tool groups

- connection and capabilities;
- task-specific profile context;
- nutrition logs and targets;
- meal plans and grocery lists;
- workout plans and execution;
- hydration and daily completion;
- progress summaries;
- user-owned correction and deletion.

Exclude:

- admin tools;
- deprecated aliases;
- internal workflow state;
- broad database exports;
- detailed clinical profile tools;
- untested experimental tools.

### 7.3 Tool standard

Every public tool requires:

- canonical name and description;
- input schema;
- output schema;
- OAuth security requirements;
- read/write/destructive/idempotent annotations;
- bounded structured output;
- ownership enforcement;
- safe error contract;
- positive and negative tests;
- production review evidence.

## 8. CIMD authentication plan

CIMD is the target ChatGPT client-identification model.

Required user journey:

```text
Choose Plaivra in ChatGPT
→ Connect
→ Plaivra-branded login
→ clear permission consent
→ authorize or deny
→ return to ChatGPT
```

Users must not copy connection UUIDs, client IDs, or bearer tokens.

Required protocol behavior:

- OAuth 2.1 authorization-code flow;
- PKCE S256;
- protected-resource metadata;
- authorization-server/OpenID discovery;
- CIMD support metadata;
- HTTPS client metadata validation;
- exact redirect validation;
- `resource` binding;
- issuer, audience, expiry, scope, ownership, connection, and revocation checks;
- useful `WWW-Authenticate` challenges;
- reauthorization and scope reduction.

Plaivra owns branding, consent, permissions, and account linking. Established identity infrastructure handles authentication security primitives behind an abstraction.

## 9. Data and privacy architecture

Every field must be classified as one of:

- standard account data;
- profile data;
- preference data;
- tracking data;
- progress data;
- sensitive user-provided context;
- private Plaivra-only data;
- ChatGPT-shareable context;
- operational metadata;
- prohibited from public ChatGPT tools.

For every category document:

- purpose;
- legal basis/consent where required;
- storage location;
- retention;
- export behavior;
- deletion behavior;
- processors;
- ChatGPT access rule;
- audit logging rule.

## 10. Canonical data-model convergence

The current database contains multiple generations of workout, exercise, meal, and integration models. Convergence must happen domain by domain.

Required ADRs:

1. canonical workout plan and performed-session model;
2. canonical exercise definition/media/override model;
3. canonical saved-meal/recipe/ingredient model;
4. canonical profile and context model;
5. canonical audit and security event model.

Migration sequence:

```text
add canonical model
→ migrate data
→ update writes
→ support compatibility reads if required
→ verify
→ remove old reads
→ monitor
→ drop deprecated objects in a later migration
```

Applied migration history is never rewritten.

## 11. Cross-platform UI strategy

Plaivra uses one design language with platform-native adaptation.

Shared:

- semantics;
- content hierarchy;
- spacing and typography tokens;
- component contracts;
- data states;
- permission language;
- accessibility outcomes;
- analytics semantics.

Platform-specific:

- navigation mechanics;
- system controls and sheets;
- safe areas;
- back behavior;
- keyboard behavior;
- haptics;
- native permissions;
- billing UI;
- platform accessibility APIs.

The web client is the functional reference, not a pixel-perfect native template.

## 12. Subscription architecture

Create a unified Plaivra Entitlement Service.

Provider events flow into one normalized account state:

```text
Stripe / Apple / Google
→ verified provider event
→ Plaivra entitlement record
→ product capability checks
```

Normalized states may include:

- inactive;
- trialing;
- active;
- grace period;
- billing issue;
- cancelled but active;
- expired;
- revoked.

Never store raw payment credentials in Plaivra or collect card information through MCP.

## 13. Delivery roadmap

### Phase 0 — Repository and constitution reset

- establish authoritative documents;
- remove obsolete audits, prompts, progress trackers, and historical migration copies;
- update agent read order;
- map database duplication;
- remove the obsolete AI action-request queue.

### Phase 1 — Premium web product

- complete core information architecture;
- stabilize daily-use routes;
- implement all required data states;
- meet accessibility and performance budgets;
- separate domain logic from React components;
- complete privacy and account controls.

### Phase 2 — Context Projection Service

- implement versioned task-specific context;
- remove broad public profile reads;
- add field-level permissions and audit events;
- validate minimum-context behavior.

### Phase 3 — CIMD and public MCP v1

- replace manual per-user client configuration;
- implement CIMD validation and OAuth discovery;
- publish curated public tools with output schemas;
- remove deprecated/internal/clinical tools from the public catalog;
- complete production testing and review evidence.

### Phase 4 — Product Constitution Lock

- close P0 and core P1 issues;
- approve canonical domain ADRs;
- lock core product and UX contracts;
- require evidence for broad later changes.

### Phase 5 — Entitlements and web subscription

- implement entitlement service;
- integrate Stripe;
- implement trial, cancellation, recovery, and customer-portal behavior;
- keep provider logic outside domain capabilities.

### Phase 6 — iOS

- create the shared mobile foundation;
- implement Apple-native navigation, Dynamic Type, accessibility, secure storage, notifications, deep links, Sign in with Apple, and StoreKit;
- release through TestFlight before public launch.

### Phase 7 — Android

- adapt the shared mobile foundation to Android navigation, predictive back, accessibility, secure storage, notifications, deep links, and Google Play Billing;
- release through staged testing.

## 14. World-class quality gates

Plaivra is launch-ready only when:

- the product can be explained in one sentence;
- ChatGPT does not ask for known profile information unnecessarily;
- only task-relevant authorized context is exposed;
- tool writes are reliable and idempotent;
- the user can correct every generated record;
- no destructive action is ambiguous;
- web and mobile layouts meet the cross-platform constitution;
- account, export, deletion, consent, and revocation work;
- logs are redacted and operational monitoring exists;
- canonical data models have owners;
- security and performance advisors have no unexplained high-impact findings;
- the reviewed commit, deployed commit, database migrations, and submission evidence match.

## 15. Governance

This plan may evolve before Product Constitution Lock, but changes must update the Product Constitution and dependent architecture documents in the same change.

After lock, broad changes require a Product Change Proposal.
