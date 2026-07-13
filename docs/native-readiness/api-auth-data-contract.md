# API, authentication, and data lifecycle

## Version and envelopes

Native API requests send `Plaivra-Contract-Version: 2026-07-11.v1`. Success uses `ApiEnvelope<T>` and errors use `ApiProblem`. Unknown major versions return `contract_version_unsupported` with the minimum and maximum supported versions. Stable IDs and server timestamps are mandatory on mutable resources.

## Authentication lifecycle

1. Use system-browser OAuth with authorization code and PKCE S256; never embed a password form in a web view.
2. Bind the code and tokens to the declared native client, exact redirect URI, user, resource, scopes, and nonce/state.
3. Store refresh credentials only in iOS Keychain or Android Keystore-backed encrypted storage. Never copy them to analytics, logs, crash reports, widgets, shared preferences, or general application tables.
4. Refresh access tokens before expiry with single-flight coordination. A revoked, expired, wrong-resource, or reduced-scope token returns a stable code and sends the client through safe reauthentication.
5. Sign-out revokes the device session and clears local sensitive caches. Account deletion revokes all Plaivra/ChatGPT connections before destructive processing.
6. Universal/App Link callbacks recover through a signed-out state without placing codes or tokens in persisted navigation history.

Passkeys or Sign in with Apple can be added only through the Supabase Auth provider configuration and an owner-reviewed account-linking design. Email aliases must not create a second Plaivra account silently.

## Entitlements

Clients read `EntitlementContract`; they do not branch on Stripe, StoreKit, or Play fields. Access-active states are trialing, active, an unexpired grace period, and cancelled-but-active before the paid-through timestamp. Refund, chargeback, expiry, and revocation are server-reduced. Historical data, privacy controls, and export remain accessible after expiry.

Store restore/account linking must prove both the provider transaction and the signed-in Plaivra account. A transaction already linked to another Plaivra account is an explicit support case, never an automatic transfer.

## Data projection

Native endpoints return route/job-specific projections. They do not return the full fitness profile by default, infer diagnosis, or expose OAuth/billing/security telemetry. User-authored text is data and is never interpreted as an instruction by server agents or MCP tools.
