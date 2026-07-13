# Plaivra iOS UI Rules

**Status:** Authoritative iOS adaptation of the Cross-Platform UI Constitution

## 1. Product goal

Plaivra on iOS must feel native to iPhone and iPad while preserving Plaivra's information architecture, brand, permissions, and data contracts.

## 2. Measurement and targets

- use points (`pt`) and safe-area insets;
- minimum effective target: 44 × 44 pt;
- standard primary action: 50–56 pt high;
- preserve comfortable spacing at all Dynamic Type sizes;
- never position important controls under system bars, the home indicator, or the keyboard.

## 3. Typography

- use semantic Dynamic Type styles;
- support accessibility text sizes;
- allow multiline labels for primary or permission actions;
- avoid fixed-height text containers;
- use tabular numerals for fitness metrics where appropriate;
- keep medical-looking typography and clinical visual language out of the general fitness product.

## 4. Navigation

- use a stable tab bar only for top-level destinations;
- use navigation stacks for drill-down flows;
- preserve standard swipe-back behavior unless an unsaved-data guard is required;
- use sheets for focused, reversible tasks;
- use full-screen flows for complex creation, authentication, consent, and destructive account actions;
- iPad may use split views or sidebars when the secondary pane remains useful independently.

## 5. System behavior

- respect light/dark appearance and increased contrast;
- support Reduce Motion and Reduce Transparency;
- provide haptics only for meaningful confirmation, warning, or selection;
- use system share, date, photo, and permission surfaces where appropriate;
- store tokens and secrets in platform-secure storage;
- implement deep links and OAuth callbacks safely.

## 6. Forms and keyboard

- choose correct keyboard types and content types;
- support AutoFill and password managers;
- keep focused fields and primary actions visible;
- use native pickers when they improve reliability;
- do not replace familiar system patterns with custom gesture-only controls;
- preserve partially completed onboarding and profile edits safely.

## 7. Accessibility

- VoiceOver labels, values, hints, and grouping are required;
- accessibility reading order must match task order;
- charts provide text summaries;
- large text must not hide values or actions;
- do not rely on swipe gestures without an accessible alternative;
- test with VoiceOver, Dynamic Type, Reduce Motion, dark mode, and increased contrast.

## 8. Notifications

- request notification permission only after explaining user value;
- reminders are user-configured and revocable;
- notification content must avoid exposing sensitive metrics on the lock screen by default;
- deep links must open the correct authenticated context and recover safely when logged out.

## 9. Authentication

- Plaivra branding remains visible;
- support Sign in with Apple when required by the final provider set and store rules;
- OAuth connection to ChatGPT uses the same server-side permission model as web;
- account deletion, export, consent, and revocation are reachable in-app.

## 10. Subscription

- use StoreKit for in-app digital subscription purchase where required;
- restore purchases must be visible and reliable;
- provider receipts update the unified Plaivra entitlement service;
- the UI reads normalized entitlement state, not raw StoreKit state;
- billing recovery and grace-period states have clear user messaging.

## 11. iOS-specific acceptance matrix

Test at minimum:

- smallest supported iPhone;
- standard and large iPhone;
- iPad compact and regular widths;
- portrait and supported landscape;
- largest accessibility text size;
- VoiceOver;
- Reduce Motion;
- dark mode and increased contrast;
- keyboard visible;
- offline and slow network;
- OAuth return and expired-session recovery.
