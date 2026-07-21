# Active Workout command receipt privacy contract

AW-2B command receipts are short-lived operational idempotency records for an open workout session. They are not workout history, analytics, timeline events, hardware identifiers, or a third performed-workout root.

## Export decision

Plaivra excludes `workout_session_execution_commands` from the user data export. This is deliberate because:

- every receipt cascades when its transient `workout_session_execution_states` row is removed at terminal session transition;
- every receipt also cascades when the owning profile is deleted;
- no receipt survives as durable completed-workout history;
- the table stores no IP address, browser fingerprint, user-agent string, secret, token, or database credential;
- payload keys are restricted to the finite AW-2B command contract and reasons are bounded;
- request hashes are internal replay-integrity material and are not useful export content;
- the retained user-facing workout state and canonical performed-set history are already exported.

Lifecycle and privacy verification is maintained in `supabase/verification/active-workout-aw2b-command-authority.sql` and `supabase/verification/active-workout-aw2b-integration.sql`.
