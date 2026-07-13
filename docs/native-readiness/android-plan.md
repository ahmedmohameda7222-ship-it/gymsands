# Android delivery plan

No Gradle project or tested Android binary exists.

- Jetpack Compose with Material semantics aligned to Plaivra, edge-to-edge insets, 48×48 dp targets, screen-reader semantics, font scaling, reduced motion, and large-screen adaptive navigation.
- Navigation Compose with system predictive back; no conflicting custom back stack. App Links use a verified Plaivra domain and safe signed-out recovery.
- OAuth through a system Custom Tab with PKCE. Refresh credentials use Keystore-backed encrypted storage and are excluded from backup, logs, analytics, screenshots, and clipboard.
- Play Billing purchases and Real-time Developer Notifications verify on Plaivra servers, then reduce into the shared entitlement contract. Support acknowledge/restore, grace period, account hold, pause, refund, chargeback, revocation, and account linking.
- WorkManager follows the shared offline queue, retry, and conflict rules. Destructive/privacy/billing operations remain online-only.
- Submission gate: Data Safety reconciliation, account deletion URL, permissions audit, notification controls, target-SDK/edge-to-edge compliance, Play Integrity decision, pre-launch report, accessibility, device-size matrix, reviewer account, screenshots, support/legal links, and closed-track evidence.
