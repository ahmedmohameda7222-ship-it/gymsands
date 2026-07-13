# Plaivra Android UI Rules

**Status:** Authoritative Android adaptation of the Cross-Platform UI Constitution

## 1. Product goal

Plaivra on Android must preserve Plaivra's brand and product model while behaving correctly across Android phones, tablets, foldables, system navigation modes, and accessibility settings.

## 2. Measurement and targets

- use density-independent pixels (`dp`) and scalable pixels (`sp`);
- minimum effective target: 48 × 48 dp;
- standard primary action: 52–56 dp high;
- support edge-to-edge content with correct system-bar and cutout insets;
- avoid fixed pixel assumptions.

## 3. Typography

- use scalable `sp` values;
- support user font scaling without clipped content;
- use semantic Plaivra roles mapped to Android typography;
- allow important actions and permission descriptions to wrap;
- use tabular numerals for metrics where appropriate.

## 4. Navigation

- respect system back and predictive-back behavior;
- phones may use bottom navigation for stable top-level destinations;
- medium windows may use a navigation rail;
- larger windows may use a persistent rail or drawer;
- preserve state when window size changes;
- do not implement custom back buttons that conflict with system behavior.

## 5. Adaptive layout

- use window-size classes or equivalent adaptive rules;
- support resizable and split-screen modes;
- foldable layouts must not place critical controls in hinge or occlusion regions;
- use extra space for useful comparison or secondary context, not stretched phone cards;
- preserve one dominant task per pane.

## 6. System behavior

- support gesture and three-button navigation;
- respect dark theme, high contrast, animation scale, and reduced motion preferences;
- use platform permission and notification flows;
- use secure storage for credentials and tokens;
- use deep links/app links with authenticated recovery.

## 7. Forms and keyboard

- use correct input types and IME actions;
- support password managers and autofill;
- handle keyboard insets without hiding primary actions;
- preserve form state across activity recreation and process recovery where practical;
- use native pickers or platform-consistent alternatives for dates and times.

## 8. Accessibility

- TalkBack names, roles, states, and traversal order are required;
- charts provide text summaries;
- touch targets remain valid when font or display size changes;
- gestures have accessible alternatives;
- test TalkBack, large font/display size, dark theme, high contrast, and reduced animation.

## 9. Notifications

- explain value before requesting permission;
- use channels with user-understandable categories;
- allow users to configure or disable reminder classes;
- avoid sensitive lock-screen content by default;
- notification deep links recover correctly when authentication has expired.

## 10. Authentication

- Plaivra branding remains primary;
- support Google sign-in where part of the final account strategy;
- ChatGPT OAuth permissions are server-enforced and consistent with web/iOS;
- account deletion, export, consent, and revocation are available in the application.

## 11. Subscription

- use Google Play Billing for in-app digital subscription purchase where required;
- acknowledge and verify purchases server-side;
- real-time provider notifications update the unified Plaivra entitlement service;
- the UI reads normalized entitlement state;
- support restore/recovery, grace period, pause, cancellation, and billing-issue messaging.

## 12. Android-specific acceptance matrix

Test at minimum:

- small, standard, and large phone;
- tablet;
- foldable or emulated foldable posture;
- portrait, landscape, and split screen;
- gesture and three-button navigation;
- predictive back;
- largest supported text/display scaling;
- TalkBack;
- reduced animation;
- dark theme/high contrast;
- offline and slow network;
- OAuth return and expired-session recovery.
