# iOS delivery plan

No Xcode project or tested iOS binary exists.

- SwiftUI with native NavigationStack, sheets, alerts, Dynamic Type, VoiceOver, Reduce Motion, Increase Contrast, and 44×44 pt targets.
- OAuth through ASWebAuthenticationSession with PKCE; refresh credentials in Keychain using the narrowest accessibility class compatible with background work.
- Sign in with Apple only after provider/account-linking rules are approved; handle private relay aliases without silent duplicate accounts.
- Universal Links for verified Plaivra routes; safe signed-out recovery; no token-bearing persisted URLs.
- StoreKit 2 purchases and App Store Server API/Notifications verify on Plaivra servers, then reduce into the shared entitlement contract. Support restore, refunds, grace periods, billing retry, revocation, and account linking.
- Background tasks are best-effort; offline queue rules remain authoritative. Notifications are generic on the lock screen and permission is contextual.
- Submission gate: privacy manifest, required-reason API audit, App Privacy answers, export/deletion access, reviewer account with synthetic data, accessibility matrix, screenshots, support/legal links, and TestFlight evidence.
