# Deep links, offline sync, and conflict handling

## Deep links

The allowlist in `DEEP_LINK_ROUTES` is the only initial custom-scheme surface. Production apps must also register verified Universal Links/App Links under `https://app.plaivra.com/open/<route-key>`. Unknown keys, embedded destinations, query-based redirects, credentials, fragments, and arbitrary URLs are rejected.

Record links such as an active workout require a separate versioned route template and strict UUID ownership lookup before they can ship. A notification or external caller never supplies a database table name.

## Offline contract

- Read cache: encrypt at rest; partition by Plaivra user; clear on sign-out/account disable; cap retention by data class.
- Write queue: `SyncMutation<T>` requires an idempotency key, client mutation ID, expected server timestamp, and client-recorded time.
- Ordering: preserve mutations within one record; independent records may sync concurrently.
- Deletion and privacy changes: online-only. Never queue account deletion, connection revocation, consent changes, billing actions, or destructive record deletion silently.
- Retry: exponential backoff with jitter for retryable network/5xx failures. Auth, ownership, validation, and version conflicts require user-visible recovery.

## Conflicts

The server is authoritative. A matching `expected_updated_at` produces a write. A stale mutation returns `version_conflict`, current server state, and a minimized diff contract. Safe additive logs may be retried with the same idempotency key. Plan/profile edits require explicit choose-server, choose-local, or manual merge; there is no last-write-wins for consequential data. Duplicate success returns the original stable ID and timestamp.
