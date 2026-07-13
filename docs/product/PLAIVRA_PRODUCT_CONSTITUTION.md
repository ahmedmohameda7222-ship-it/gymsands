# Plaivra Product Constitution

**Version:** 2026.2
**Status:** Highest product authority
**Applies to:** Product, UX, data, ChatGPT integration, web, iOS, Android, documentation, and agent work

## 1. Product definition

Plaivra is a user-controlled persistent fitness context, execution, tracking, history, and visualization platform designed to work with ChatGPT.

The product solves two connected problems:

1. Users should not repeat their age, body profile, goals, schedule, equipment, food preferences, cooking constraints, budget, and relevant fitness constraints in every new ChatGPT conversation.
2. Useful plans and actions created in ChatGPT should not remain trapped in chat messages or PDFs. They should become structured, editable, trackable Plaivra data.

## 2. Canonical workflow

```text
User maintains a Plaivra profile
→ user connects Plaivra to ChatGPT
→ user grants specific read/write permissions
→ user asks ChatGPT for advice or an action
→ ChatGPT reads only the minimum authorized context required
→ ChatGPT asks only for essential missing information
→ ChatGPT reasons about the request
→ for executable requests, ChatGPT calls authorized Plaivra tools
→ Plaivra stores the confirmed structured result
→ Plaivra visualizes, tracks, edits, corrects, exports, or deletes it
```

There is no normal copy-and-paste import workflow and no second in-app approval queue after a successful ChatGPT tool call.

## 3. Division of responsibility

### ChatGPT

ChatGPT is the reasoning and intelligent-execution layer. It may:

- interpret user intent;
- use authorized Plaivra context;
- create plans and structured actions;
- explain progress;
- adapt a plan when requested;
- call Plaivra tools after the required user intent and confirmation.

### Plaivra

Plaivra is the durable product and user-control layer. It must:

- store user-owned structured data;
- expose task-specific authorized context;
- enforce authentication, authorization, ownership, validation, and rate limits;
- persist confirmed tool results;
- show plans, logs, history, status, and visualizations;
- support direct execution controls;
- make correction, replacement, deletion, export, and revocation clear.

Plaivra does not independently generate workout or meal plans.

## 4. What Plaivra is not

Plaivra is not:

- a medical provider, medical device, diagnostic service, treatment service, prescription service, or emergency service;
- an in-app chatbot competing with ChatGPT;
- a generic manual calorie tracker;
- a generic gym application;
- a document storage destination for copied ChatGPT output;
- an AI review/import queue;
- a system that gives ChatGPT unrestricted access to the entire user account.

## 5. Data statement

Plaivra stores profile, preference, planning, tracking, progress, account, consent, and operational data intentionally provided or created by users.

Plaivra must never claim that it stores no user data.

Plaivra does not:

- obtain clinical records from healthcare providers;
- diagnose a condition;
- infer a diagnosis from tracking data;
- prescribe treatment or medication;
- silently expand the data shared with ChatGPT.

Every stored category must have a documented purpose, retention rule, deletion behavior, and ChatGPT-sharing classification.

## 6. Persistent context rule

The complete user profile must not be returned by default.

The required architecture is:

```text
Stored user profile
→ task-specific context projection
→ permission and sensitivity check
→ minimum required structured context
→ ChatGPT
```

Examples of context projections:

- training-planning context;
- nutrition-planning context;
- workout-adjustment context;
- daily-execution context;
- progress-summary context;
- meal-preparation context.

A meal-plan request must not automatically receive unrelated workout history, private notes, account details, or sensitive profile fields.

## 7. Fitness constraints and sensitive context

Plaivra may store user-authored fitness constraints so users do not repeat them in every conversation.

For the public ChatGPT integration, prefer functional constraints such as:

- avoid overhead pressing;
- avoid painful shoulder ranges;
- do not schedule running;
- use low-impact cardio;
- avoid deep knee flexion;
- prefer specific equipment.

Detailed diagnoses, medications, clinician notes, treatment plans, pregnancy medical context, eating-disorder assessments, test results, and medical documents are not part of the public ChatGPT v1 context catalog.

Private Plaivra data and ChatGPT-shareable context are separate concepts. Storing a field does not automatically authorize ChatGPT to read it.

## 8. Permission rules

Permissions must be:

- least-privilege;
- task-relevant;
- understandable;
- separately revocable;
- enforced server-side on every request;
- split between read and write capability;
- sensitivity-aware.

A valid OAuth token never overrides the user's current saved Plaivra permissions.

Admin tools and member-data administration must never be available through the normal public ChatGPT connection.

## 9. Advisory and executable requests

### Advisory

Read-only examples:

- explain my week;
- compare my progress with my goal;
- summarize my current plan;
- identify what I should prioritize today.

### Executable

Write examples:

- create a workout plan;
- create a meal plan;
- log a meal;
- replace an exercise;
- update a target;
- save a grocery list;
- log water or progress.

ChatGPT must not claim success until the Plaivra tool returns confirmed success.

## 10. Direct product controls

Direct Plaivra controls remain valid when they are the fastest execution or correction path, including:

- logging workout sets;
- completing or skipping a workout;
- marking planned meals complete;
- quick water logging;
- completing tasks, habits, or supplements;
- editing or deleting records;
- correcting ChatGPT-created data;
- account, privacy, consent, export, and revocation controls.

These controls do not make Plaivra a manual-first product.

## 11. Cross-platform order

The required order is:

1. premium, stable web product;
2. public ChatGPT app integration;
3. unified subscription and entitlement foundation;
4. iOS application;
5. Android application.

Web, iOS, and Android must share product rules, domain contracts, permissions, analytics semantics, and design tokens while using platform-appropriate UI behavior.

## 12. Authentication direction

Plaivra owns the brand, login experience, consent language, account linking, and permission UX.

Established identity infrastructure should handle security primitives behind a replaceable abstraction.

For the ChatGPT app, Client ID Metadata Documents (CIMD) are the target client-identification architecture. The final connection flow must not require users to copy client IDs, bearer tokens, or connection UUIDs.

## 13. Subscription direction

Plaivra must use a unified entitlement service independent of any single payment provider.

Expected providers:

- web: Stripe Billing;
- iOS: Apple StoreKit / In-App Purchase;
- Android: Google Play Billing.

Product capabilities are controlled by Plaivra entitlements, not directly by provider-specific UI state.

## 14. Pre-launch mutability

Before Product Constitution Lock, Plaivra has no established production-user contract that prevents structural improvement.

Routes, features, navigation, UI, flows, names, components, and domain boundaries may be added, removed, merged, split, renamed, redesigned, or rebuilt when evidence shows the change improves the product.

Security, user ownership, data integrity, authentication correctness, migration safety, and legal obligations must always be preserved.

## 15. Product Constitution Lock

The lock may be declared only when:

- the product model is implemented;
- core information architecture is stable;
- core flows meet the accepted quality bar;
- no unresolved P0 remains;
- no high-impact core-flow P1 remains;
- the cross-platform design system is stable;
- ChatGPT execution and permission behavior is verified;
- privacy and security architecture is documented;
- the platform and subscription roadmaps are accepted.

After lock, broad product changes require a Product Change Proposal containing problem evidence, affected users, data impact, security impact, platform impact, migration plan, acceptance criteria, and rollback plan.

Bug, security, accessibility, legal, performance, and evidence-backed usability fixes may proceed directly.

## 16. Documentation authority

When documents conflict, use this order:

1. `docs/product/PLAIVRA_PRODUCT_CONSTITUTION.md`
2. `docs/product/PLAIVRA_LONG_TERM_PRODUCT_AND_PLATFORM_PLAN.md`
3. `docs/product/ai-first-tracker-model.md`
4. `docs/design-system/PLAIVRA_CROSS_PLATFORM_UI_CONSTITUTION.md`
5. `docs/chatgpt-app/README.md`
6. `docs/chatgpt-app/cimd-authentication-architecture.md`
7. `docs/architecture/canonical-domain-model.md`
8. `docs/platform-roadmap/README.md`
9. current implementation documentation
10. code and migration history as evidence of current implementation, not product authority

Audit reports, completed prompts, progress trackers, and historical status reports are not product authority.

## 17. Non-negotiable rules

1. Plaivra does not diagnose.
2. Plaivra accurately discloses stored data.
3. Users own and control their data.
4. ChatGPT receives only relevant authorized context.
5. The full profile is not returned by default.
6. Sensitive context is separately controlled.
7. No normal manual copy-back from ChatGPT.
8. No false execution confirmation.
9. No hidden write access.
10. No admin capability through public member OAuth.
11. No copied token or client-ID setup in the final connection journey.
12. No obsolete review/import queue.
13. No historical document may override this constitution.
14. Every destructive database cleanup requires dependency proof, migration safety, and rollback.
15. Web, iOS, and Android are one Plaivra product, not three independent products.
