# Reviewer, demo, and submission asset checklists

## Synthetic reviewer account

Create manually in the isolated/reviewer environment, never by seeding production automatically. Use a clearly synthetic identity and data covering onboarding, one workout plan/session, food log, meal plan/groceries, progress/chart history, functional constraints, scoped ChatGPT permissions, connection revocation, export, deletion impact, empty/error/retry states, and entitlement states only if an offering is approved. Do not use a real person's photos, health details, payment method, email history, or ChatGPT conversation.

Record credentials only in the platform's approved reviewer-secret channel, not source control, screenshots, issues, or the release manifest. Verify that reviewer data cannot access another account.

## OpenAI / ChatGPT app

- production MCP HTTPS URL, protected-resource metadata, authorization-server metadata, CIMD behavior, and exact redirects;
- final 20–35 tool catalog with strict input/output schemas and reviewed annotations;
- positive and negative tool test cases, stable error codes, idempotency/concurrency evidence, scope minimization, cross-user denial, revocation;
- truthful app name, description, logo, support, Privacy, Terms, health disclaimer, and account deletion URL;
- product screenshots captured from the reviewed release with synthetic data; no fake reviews, user counts, platform availability, or approval queue;
- demo script that shows connect → limited permission → task-specific context → authorized tool → Plaivra tracking/correction;
- reviewer credential delivered outside source control;
- owner confirmation of OpenAI Platform domain/connector configuration and final submission.

## Future Apple App Store

No assets are submission-ready until a tested iOS binary exists. Future checklist: bundle ID/team/signing, App Store Connect record, privacy manifest, App Privacy answers, required-reason APIs, Sign in with Apple/account linking, StoreKit products and server notifications, restore/refund/grace/revocation, account deletion, export, support/legal URLs, age rating, accessibility/Dynamic Type, device screenshots from the tested build, review notes, synthetic account, TestFlight evidence, and professional legal review where required.

## Future Google Play

No assets are submission-ready until a tested Android binary exists. Future checklist: package/signing/app integrity, Play Console record, Data Safety, target API and edge-to-edge/predictive-back compliance, permissions/notifications, Play products and RTDN, restore/refund/hold/pause/revocation, account deletion URL, export, support/legal URLs, content rating, accessibility/font scaling/device coverage, screenshots from the tested build, review notes, synthetic account, closed-track/pre-launch evidence, and professional legal review where required.

## Truth gate

Do not mark any checklist item complete from plans or source presence alone. Retain the actual platform record, tested binary/release commit, screenshot provenance, test result, reviewer decision, or owner approval that proves it.
