# Plaivra Platform Roadmap

**Version:** 2026.1  
**Status:** Strategic engineering plan  
**Time horizon:** 12+ months  
**Primary goal:** Build Plaivra as a reliable premium web app first, while preparing the architecture, product rules, payments, privacy, and UX foundations so iOS and Android later require platform adaptation instead of a full rebuild.

---

## 1. Executive decision

Plaivra should **not** split into three separate repositories now.

Do not create:

```txt
plaivra-web/
plaivra-ios/
plaivra-android/
```

That would create duplicated product logic, duplicated bugs, duplicated subscription handling, duplicated AI permissions, and inconsistent UX.

Recommended direction:

```txt
Now:
- One reliable web app repository.

Prepare during web phase:
- Shared business logic.
- Shared API/client layer.
- Shared validation and domain types.
- Shared design and motion tokens.
- Store-compliant subscription architecture.
- Native-ready UX and privacy rules.

Later:
- Move toward a monorepo when mobile begins.
- Add one Expo React Native app for both iOS and Android.
```

The goal is not speed. The goal is a strong base.

---

## 2. Product philosophy

Plaivra should be built as a platform, not as a website that later gets wrapped quickly.

Every major web decision should ask:

```txt
Will this still make sense when Plaivra exists on iOS and Android?
Can this logic be reused outside the web UI?
Is this purchase/subscription flow allowed on app stores later?
Does this privacy or AI permission model survive native review?
Does this UI pattern translate to mobile-native behavior later?
```

If the answer is no, the web implementation should be redesigned before it becomes expensive to migrate.

---

## 3. Reference sources

These official sources should be rechecked before implementation milestones because platform rules can change.

### Apple

- App Store Review Guidelines  
  https://developer.apple.com/app-store/review/guidelines/
- Auto-renewable subscriptions  
  https://developer.apple.com/app-store/subscriptions/
- Human Interface Guidelines  
  https://developer.apple.com/design/human-interface-guidelines/
- TestFlight  
  https://developer.apple.com/testflight/
- App Store Connect  
  https://developer.apple.com/help/app-store-connect/

### Google

- Google Play payments policy  
  https://support.google.com/googleplay/android-developer/answer/9858738
- Google Play Console Help  
  https://support.google.com/googleplay/android-developer/
- Android app quality guidance  
  https://developer.android.com/quality
- Material Design  
  https://m3.material.io/

### Cross-platform mobile stack

- React Native  
  https://reactnative.dev/
- Expo  
  https://docs.expo.dev/
- EAS Build  
  https://docs.expo.dev/build/introduction/
- EAS Submit  
  https://docs.expo.dev/submit/introduction/

### Internal Plaivra references

- `docs/ux-constitution/README.md`
- `docs/ux-constitution/motion-and-interaction.md`
- `docs/ux-progress/README.md`

---

## 4. Target architecture

### 4.1 Current phase

During the current web-only phase, the existing repository remains the main product repository.

Do not prematurely create separate iOS or Android repositories.

### 4.2 Future monorepo shape

When mobile work begins, migrate toward this structure:

```txt
plaivra/
  apps/
    web/
      Next.js web app
    mobile/
      Expo React Native app for iOS and Android

  packages/
    core/
      business rules
      domain types
      validation schemas
      calculations
      AI request builders
      entitlement logic

    api-client/
      Supabase/API wrappers
      auth/session helpers
      storage helpers
      sync helpers

    design-tokens/
      colors
      typography
      spacing
      radius
      elevation
      motion tokens

    ux-constitution/
      UI/UX reference docs
      motion standard
      audit progress

    config/
      shared linting
      TypeScript config
      environment validation
```

### 4.3 What should be shared

Share these across web and mobile:

```txt
- Domain types.
- Validation schemas.
- Nutrition calculations.
- Workout calculations.
- Progress calculations.
- AI permission rules.
- AI request templates/builders.
- Subscription entitlement logic.
- Feature flags.
- Copy/microcopy where appropriate.
- Design tokens.
- Motion tokens.
- Supabase/API access wrappers.
```

### 4.4 What should not be blindly shared

Do not blindly share these:

```txt
- Exact web UI components.
- Desktop layout patterns.
- Web-only modals.
- Hover-based interactions.
- URL-dependent navigation assumptions.
- CSS-only effects that do not translate to native.
```

Web and native can share logic and standards, but their UI components should be platform-appropriate.

---

## 5. Recommended technology direction

### 5.1 Web

Current web app remains:

```txt
- Next.js
- React
- Supabase/backend services
- Tailwind/design tokens
- Framer Motion or equivalent motion primitives where appropriate
```

### 5.2 Native mobile

Recommended future native stack:

```txt
- Expo React Native
- One mobile codebase for both iOS and Android
- Shared backend and shared core logic
- Platform-specific UI adaptation where needed
- EAS Build and EAS Submit for app-store delivery
```

Reason:

- React Native creates native apps for Android and iOS using React.
- Expo reduces operational friction for builds, device testing, and store submission.
- One mobile app codebase is more realistic than separate Swift and Kotlin apps for a solo/small-team product.

### 5.3 What not to choose as the main long-term path

Avoid making Capacitor/webview the final premium native strategy unless a deliberate technical decision is made later.

Capacitor can be useful for a temporary app-store wrapper, but Plaivra's target is a premium native-feeling product. A webview wrapper risks weaker native feel, weaker platform integration, and more store-review friction if not handled carefully.

Swift + Kotlin fully separate apps are also not recommended now because they multiply engineering and maintenance work.

---

## 6. Phase plan

## Phase 0 — Foundations and source of truth

Status: in progress.

Required outputs:

```txt
- UX constitution.
- Motion and interaction standard.
- UX progress tracker.
- Platform roadmap.
- Route-by-route audit plan.
```

Done when:

```txt
- All future UI/UX work references the constitution.
- All motion/interaction decisions reference the motion standard.
- All route audits update the progress tracker.
- All platform decisions reference this roadmap.
```

---

## Phase 1 — Premium mobile-first web app

Goal: make the current web app feel release-grade on mobile before native work begins.

Scope:

```txt
- Buttons and action hierarchy.
- Spacing and visual rhythm.
- Motion and interaction quality.
- Loading, empty, success, and error states.
- Mobile tap comfort.
- Safe-area handling.
- AI action clarity and permission boundaries.
- Destructive action protection.
- Auth quality.
- Data privacy quality.
```

Required work:

```txt
1. Audit routes using docs/ux-progress/README.md.
2. Fix P0 and P1 issues before considering subscriptions or native.
3. Add motion only where it improves feedback, state clarity, completion, or recovery.
4. Remove unnecessary visible actions.
5. Make repeated daily actions fast and optimistic where safe.
6. Ensure important flows work cleanly on mobile widths.
```

Done when:

```txt
- Core routes score at least 90/100 in UX progress tracker.
- No P0 issues remain.
- No high-impact P1 issues remain in daily-use routes.
- Web app no longer feels static or AI-assembled.
```

---

## Phase 2 — Architecture hardening for future native reuse

Goal: reduce future native rewrite cost by separating product logic from web UI.

Required work:

```txt
1. Move reusable types to clear shared-style folders.
2. Isolate calculations from components.
3. Isolate AI request builders from UI.
4. Isolate permission and entitlement rules.
5. Isolate Supabase/API calls behind service functions.
6. Avoid component-level business logic that native cannot reuse.
7. Keep route components focused on rendering and orchestration.
```

Suggested domains to isolate:

```txt
- workout domain
- nutrition domain
- meal plan domain
- hydration domain
- progress domain
- wellness domain
- AI permissions domain
- subscription/entitlement domain
- profile/onboarding domain
```

Done when:

```txt
- Core product rules can be imported without importing web components.
- Reusable logic has tests where practical.
- Native mobile could call the same service layer or a close equivalent.
```

---

## Phase 3 — Auth and account system readiness

Goal: make the authentication and account model production-grade before subscriptions and native apps.

Required principles:

```txt
- Auth must be reliable and predictable.
- Account deletion/export/privacy flows must be clear.
- The same account should work on web, iOS, and Android later.
- Auth flow must not depend on web-only assumptions.
```

Required work:

```txt
1. Review login/register/reset-password flows.
2. Add complete loading/error states.
3. Ensure redirect/deep-link strategy is documented.
4. Prepare mobile deep link requirements for auth callbacks.
5. Ensure profile completion/onboarding state is platform-neutral.
6. Ensure privacy request and account deletion flows are store-safe.
```

Done when:

```txt
- Auth works predictably on web.
- Auth design can support mobile callback/deep-link behavior later.
- Account and privacy flows meet trust requirements.
```

---

## Phase 4 — Subscription architecture on web

Goal: add web subscriptions without creating a Stripe-only system that blocks iOS/Android later.

Critical rule:

```txt
Plaivra must use a unified entitlement model.
Do not make premium access depend directly on one payment provider.
```

Recommended model:

```txt
user_entitlements
  user_id
  plan_tier
  status
  source_platform: web | ios | android | manual | promo
  source_provider: stripe | apple | google | admin
  provider_customer_id
  provider_subscription_id
  current_period_start
  current_period_end
  trial_ends_at
  cancel_at_period_end
  last_verified_at
```

Web subscriptions can use Stripe, but app access should check Plaivra entitlements, not Stripe directly.

### Store-rule awareness during web subscription design

Apple and Google payment rules must shape the product now.

Important constraints:

```txt
- iOS digital subscriptions will generally require Apple In-App Purchase if purchasing happens inside the iOS app.
- Android digital subscriptions distributed through Google Play will generally require Google Play Billing if purchasing happens inside the Android app.
- Users may be allowed to access subscriptions purchased on another platform, but native app purchase CTAs and external payment links are restricted depending on platform, storefront, and current policy.
- Product copy, screenshots, and metadata must clearly disclose paid features.
```

Therefore:

```txt
- Build entitlement logic independently from Stripe.
- Keep upgrade UI platform-aware.
- Do not hardcode web checkout assumptions into core product flows.
- Do not rely on native apps sending users to web checkout unless platform rules allow it at launch time.
```

Done when:

```txt
- Web subscription works.
- Premium features are controlled by unified entitlements.
- The system can later accept Apple and Google subscription receipts.
- Product copy clearly explains free vs paid access.
```

---

## Phase 5 — PWA and mobile-web polish

Goal: make the web app behave like a serious mobile product before native work.

Required work:

```txt
1. Add/verify manifest and mobile metadata.
2. Add high-quality icons and splash assets if PWA is supported.
3. Review safe-area support.
4. Review offline/sync states.
5. Review performance on mobile devices.
6. Review installability if relevant.
7. Ensure no hover-only interactions.
8. Ensure keyboard/input behavior is mobile-safe.
```

Done when:

```txt
- Plaivra works cleanly as mobile web.
- Mobile web flows expose no platform assumptions that would hurt native.
```

---

## Phase 6 — Monorepo migration

Goal: prepare the codebase for parallel web and mobile development.

Only start this phase when:

```txt
- Core web product is stable.
- UX audit is mostly passed.
- Subscription architecture is defined.
- Shared logic boundaries are clear.
```

Target structure:

```txt
apps/web
apps/mobile
packages/core
packages/api-client
packages/design-tokens
packages/config
```

Migration principles:

```txt
- Do not rewrite product behavior during monorepo migration.
- Move structure first, then build mobile.
- Keep web stable throughout migration.
- Use tests/checks before and after movement.
```

Done when:

```txt
- Web app still works after migration.
- Shared packages can be imported by web.
- Mobile app shell can be created without copying web logic manually.
```

---

## Phase 7 — Expo mobile foundation

Goal: create the first native mobile app foundation without rebuilding the entire product at once.

Initial mobile scope:

```txt
- Auth shell.
- App shell/navigation.
- Dashboard.
- Workout session.
- Calories quick log.
- Hydration.
- Settings/account.
- Subscription state display.
```

Do not start with every feature.

Mobile-first priorities:

```txt
- Native navigation feel.
- Native tap comfort.
- Fast repeated actions.
- Offline/sync clarity.
- Store-safe subscription UI.
- Strong loading/error states.
```

Done when:

```txt
- Mobile shell is stable.
- Core daily-use flows work on real iOS and Android devices.
- Shared logic is reused where appropriate.
- Platform-specific UI is not just a web copy.
```

---

## Phase 8 — iOS readiness

Goal: prepare Plaivra for TestFlight and App Store Review.

Required work:

```txt
1. Apple Developer Program enrollment.
2. Bundle identifier.
3. App Store Connect app record.
4. App icon and screenshots.
5. Privacy labels.
6. App privacy policy URL.
7. Support/contact URL.
8. TestFlight setup.
9. Demo account or full demo mode for App Review.
10. IAP/subscription products if native purchasing is offered.
11. Restore purchases flow.
12. App Review notes explaining AI features and subscriptions.
13. Crash and bug testing on real device.
```

Apple review risk areas for Plaivra:

```txt
- Health/fitness claims must avoid medical diagnosis or unsafe claims.
- AI recommendations must not silently change user data.
- Subscription copy must clearly describe paid features.
- IAP products must be complete and reviewable.
- Privacy labels must accurately match collected data.
- Demo access must be provided if login is required.
```

Done when:

```txt
- Internal TestFlight build works.
- All App Store metadata is accurate.
- Subscriptions/entitlements work in sandbox.
- Privacy and AI behavior are documented for review.
```

---

## Phase 9 — Android readiness

Goal: prepare Plaivra for Google Play internal testing and production release.

Required work:

```txt
1. Google Play Developer account.
2. Package name/application ID.
3. Play Console app setup.
4. App signing.
5. Store listing.
6. Data safety section.
7. Privacy policy URL.
8. Internal testing track.
9. Google Play Billing products if native purchasing is offered.
10. Restore/entitlement sync behavior.
11. Device testing across common Android screen sizes.
12. Clear subscription pricing and terms.
```

Google Play risk areas for Plaivra:

```txt
- Digital subscription purchases in the Android app generally require Google Play Billing.
- In-app UI must not lead users to external payment methods unless allowed by current policy.
- Data safety declarations must match actual data collection and sharing.
- Health/fitness claims must be careful and non-medical unless properly supported.
```

Done when:

```txt
- Internal testing build works.
- Billing sandbox/testing works.
- Store listing and data safety are accurate.
- Entitlements sync across web and Android.
```

---

## Phase 10 — Cross-platform entitlement and subscription maturity

Goal: make paid access reliable across web, iOS, and Android.

Required backend capabilities:

```txt
- Stripe webhook verification.
- Apple receipt/server notification handling.
- Google Play purchase token verification.
- Unified entitlement table.
- Periodic entitlement reconciliation.
- Restore purchases.
- Account merge/collision handling.
- Refund/cancel/grace-period handling.
- Admin override/promo capability.
```

Product requirements:

```txt
- User knows current plan.
- User knows renewal/cancel status.
- User can restore purchases on native.
- User can access paid features across platforms when allowed.
- App copy does not violate platform payment rules.
```

Done when:

```txt
- A subscription from any supported platform grants correct access everywhere.
- Cancellations, refunds, and expired subscriptions are reflected correctly.
- Native apps do not depend on Stripe-only assumptions.
```

---

## 7. Engineering rules from now

Every web implementation should follow these rules to reduce future native cost.

### 7.1 Keep product logic out of UI components

Bad:

```txt
Component calculates subscription status, permission rules, nutrition totals, and renders UI.
```

Good:

```txt
Service/domain function calculates status.
Component renders based on a clean result.
```

### 7.2 Avoid web-only assumptions

Avoid:

```txt
- hover-only actions
- tiny buttons
- desktop-first tables
- URL-only flow logic
- browser-only storage as source of truth
- UI that depends on mouse precision
```

Prefer:

```txt
- tap-first design
- 48px touch targets
- mobile-first cards/lists
- platform-neutral state machines
- server-backed durable state
```

### 7.3 Treat AI permissions as platform-critical

AI permissions should be:

```txt
- explicit
- revocable
- scoped
- explainable
- auditable
- never silently destructive
```

Native app reviewers and users must understand what AI can read or change.

### 7.4 Treat privacy as a product feature

From now, Plaivra should keep:

```txt
- data export
- account deletion/request flow
- privacy policy
- support contact
- clear data categories
- minimized sensitive data access
```

This reduces future App Store and Play Store friction.

---

## 8. Quality gates

Do not move to the next phase unless the current phase passes its gate.

| Gate | Required before proceeding |
|---|---|
| UX Gate | Core daily routes score 90+ in `docs/ux-progress/README.md`. |
| Architecture Gate | Shared domain logic is isolated from UI. |
| Auth Gate | Auth, onboarding, account, export, and deletion flows are stable. |
| Subscription Gate | Web subscription uses unified entitlements, not Stripe-only checks. |
| Mobile Gate | Web app is mobile-first and native-ready. |
| Store Gate | Apple/Google policies are rechecked before native purchase implementation. |
| Release Gate | Real-device testing, crash checks, privacy metadata, and demo access are complete. |

---

## 9. What to tell future AI agents

Use this instruction when asking Codex, Claude, Kimi, or another agent to work on platform strategy or native preparation:

```txt
Follow docs/platform-roadmap/README.md, docs/ux-constitution/README.md, docs/ux-constitution/motion-and-interaction.md, and docs/ux-progress/README.md. Plaivra is web-first now but must be prepared for future iOS and Android without rushing. Do not split into separate iOS/Android repos. Do not duplicate product logic. Keep business rules, entitlements, AI permissions, validation, and design/motion tokens reusable. Any subscription work must use a unified entitlement model and remain compatible with future Apple In-App Purchase and Google Play Billing requirements.
```

---

## 10. Immediate next steps

Recommended next steps after adding this roadmap:

```txt
1. Continue UI/UX route audits using docs/ux-progress/README.md.
2. Fix P0/P1 UI, motion, feedback, and trust issues.
3. Start identifying logic that should later move into shared packages.
4. Before adding web subscriptions, design the unified entitlement model.
5. Before any native work, recheck current Apple and Google policies.
```

The correct strategy is slow, deliberate, and reliable: make the web app excellent first, but make every serious architecture decision native-aware from now.
