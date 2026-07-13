# Plaivra native readiness contracts

Contract version: `2026-07-11.v1`  
Status: architecture and contracts only. No iOS or Android binary exists, and no native test is claimed.

These contracts preserve the Plaivra product model across web, future native clients, and ChatGPT: structured private context remains in Plaivra; permissions remain user-controlled; ChatGPT performs authorized reasoning/execution; and native clients provide platform-appropriate tracking, correction, privacy, and direct controls.

The normative TypeScript contract is `lib/platform/contracts.ts`. Any incompatible change requires a new version, a supported overlap window, client telemetry that does not contain fitness values, and a documented retirement date.

Documents:

- [API, authentication, and data lifecycle](api-auth-data-contract.md)
- [Deep links, offline sync, and conflicts](deep-links-offline-conflicts.md)
- [Notifications, analytics, and privacy mapping](notifications-analytics-privacy.md)
- [iOS delivery plan](ios-plan.md)
- [Android delivery plan](android-plan.md)
- [Screen parity matrix](screen-parity-matrix.md)
