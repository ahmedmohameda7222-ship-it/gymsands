# Notifications, analytics, and privacy mapping

## Notifications

Permission is requested only after explaining a user-selected reminder value. Lock-screen text is generic by default: no body weight, calories, meals, injuries, functional constraints, progress values, account email, or ChatGPT prompt text. Payloads use a route key and opaque owned record ID. The app reauthenticates and rechecks ownership before opening sensitive content. Notification categories, quiet hours, per-reminder controls, and global disable are user-managed.

## Analytics taxonomy

The source allowlist is `ANALYTICS_EVENTS`. Permitted properties are platform, app version, reviewed route key, coarse outcome, and stable error code. Prohibited properties include free text, user ID/email, access tokens, precise health/fitness/nutrition measurements, diagnoses, constraints, workout/meal names, GPS, advertising IDs, and provider payloads. Analytics consent and platform privacy declarations must match actual collection; disabling analytics must not disable core Plaivra functions.

## Privacy/data-safety mapping

| Data class | Purpose | Default transport/storage | Store declaration |
| --- | --- | --- | --- |
| Account identifier | Sign-in and ownership | TLS; server; secure token storage | Account management |
| Fitness/nutrition/wellness data | User-requested planning and tracking | TLS; encrypted device cache when enabled | Health & fitness / app functionality |
| Photos/files | User-requested progress or attachments | Private storage; signed URLs | User content |
| Subscription status | Entitlement and recovery | Provider + Plaivra entitlement service | Purchases |
| Diagnostics | Reliability and security | Redacted, bounded retention | Diagnostics, only if enabled/collected |
| Notifications | User-selected reminders | Provider delivery with generic lock-screen text | App functionality |

Before submission, the owner must reconcile this mapping with SDK manifests, App Privacy details, Google Data Safety, retention periods, processors, deletion behavior, export contents, and professional legal review. This document is not a store submission or legal approval.
