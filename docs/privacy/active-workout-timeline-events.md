# Active Workout Timeline Events

AW-2C adds an immutable, durable historical projection beneath the canonical `workout_sessions -> exercise_logs` performed-session model. Timeline rows describe meaningful committed transitions; they do not replace canonical current state, performed sets, execution state, muscle snapshots, or derived analysis.

## Included events

The timeline can record session start, pause, resume, rest start/end, set completion/edit, explicit exercise skip, exercise replacement, and session completion/skip/cancellation. Runtime events are written only by reviewed atomic PostgreSQL authorities in the same transaction as the canonical mutation. Conservative migration backfill records only provable starts, completed sets, recorded replacements, completed sessions, and skipped sessions.

Operational noise is excluded: cursor-only movement, screens, timers/heartbeats, cache import, controller-device changes, retries, reads, command no-ops, and command conflicts do not create timeline rows. AW-2B command receipts remain transient operational idempotency records; timeline events are durable history.

## Privacy and export

Export Plaivra Data includes these user-meaningful fields:

- `workout_session_id`
- `sequence_number`
- `event_type`
- `occurred_at`
- `source`
- `exercise_log_id`
- `snapshot_item_id`
- `payload_version`
- `payload`
- `created_at`

Internal correlation fields `idempotency_key` and `command_id` are deliberately excluded from the user-facing export. Payloads do not contain IP addresses, user agents, browser/device fingerprints, access or refresh tokens, database credentials, raw controller IDs, AW-2B request hashes, or raw free-form session/set notes.

Timeline rows cascade with their canonical workout session and profile. The trusted account/privacy deletion workflow may physically delete the canonical session and therefore its timeline. Ordinary app users can read only their own rows and cannot directly insert, update, or delete timeline events.
