# Plaivra Privacy Export, Retention, and Deletion Runbook

Status: implementation prepared; destructive production execution disabled. Professional legal review and owner approval are required before launch activation. This document does not claim that a production cleanup or deletion job has run.

## User export

`GET /api/user/data-export` produces an authenticated current-user ZIP containing:

- `data.json` with canonical user-owned domains;
- one CSV per top-level domain plus account CSV;
- `manifest.json` with file names, record counts, format versions, and warnings;
- `storage-manifest.json` with private bucket paths only, never signed URLs.

The export explicitly omits OAuth authorization codes, token hashes, integration access/refresh tokens, idempotency hashes, raw MCP input, and internal security telemetry. Direct rows are constrained to the authenticated `user_id`; child rows are constrained through owned parent IDs. A two-user automated test verifies that a caller-supplied user ID cannot expand the export scope.

The workout export also includes the Train Phase 2A program graph through owned parent relationships: `user_workout_plan_week_templates`, `user_workout_plan_weeks`, `user_workout_plan_sessions`, `user_workout_plan_phases`, and `user_workout_plan_activities`. Stable IDs and parent references are preserved; Activity Catalog credentials and provider secrets are never exported.

## Deletion request and execution sequence

1. The member reviews the impact summary and types `DELETE MY PLAIVRA ACCOUNT`.
2. The API verifies a server-returned `last_sign_in_at` within ten minutes. Older sessions must sign in again with their existing provider.
3. A client-generated idempotency key is hashed; plaintext is never stored.
4. Active ChatGPT connections, OAuth access tokens, and Supabase refresh sessions are revoked immediately.
5. A service-only deletion job is queued and the account is marked `deletion_pending`.
6. The worker checks for an active legal hold and verifies that every external provider has a cleanup adapter before irreversible work.
7. The worker marks the account `deletion_processing`; authenticated APIs then fail closed.
8. Private Storage objects are enumerated under the authenticated owner folder and through canonical photo metadata, then removed through the Storage API in batches of at most 1,000.
9. Provider cleanup runs. Unknown legacy `user_integrations` block the job with `provider_cleanup_adapter_required`; they are never silently abandoned.
10. Non-cascading log/import references are deleted or detached, then Supabase Auth deletes the user server-side. Profile-owned rows cascade in the reviewed dependency graph. Train Phase 2A program rows inherit ownership through `user_workout_plans` and are removed through the verified plan/template/session/phase/activity cascade chain.
11. The completion email recipient is held only as AES-256-GCM ciphertext and cleared after notification. Delivery failures retry; an unavailable email provider is recorded as a manual action.
12. The service-only job retains minimized evidence: stage, counts, safe error code, attempt count, timestamps, and a one-way subject hash. It retains no email, token, prompt, note, measurement, or photo path after completion.

The worker claims jobs with `FOR UPDATE SKIP LOCKED`, records each stage, uses bounded exponential retries, and treats replayed requests as the same job.

## Legal holds

`privacy_deletion_legal_holds` is service-role-only. An active hold moves the job to `blocked_legal_hold` and keeps member access available. Releasing a hold requires an authenticated admin process and a reason code; no public/member route can create or release a hold. That admin workflow remains a manual platform action until the owner and legal reviewer define authorization and evidence requirements.

## Retention cleanup

The bounded `cleanup_privacy_retention_artifacts` function supports dry-run counts and execution for:

- redacted MCP audit logs;
- external API and email operational logs;
- completed privacy requests.

Expired OAuth code/token and MCP idempotency cleanup use their separate bounded functions. Every cleanup call is batch-limited, contains no client-supplied user ID, and returns counts only.

No retention duration is assumed. The following environment values must remain unset until the owner and professional legal reviewer approve concrete periods and purposes:

- `PRIVACY_RETENTION_MCP_AUDIT_DAYS`;
- `PRIVACY_RETENTION_SECURITY_LOG_DAYS`;
- `PRIVACY_RETENTION_COMPLETED_REQUEST_DAYS`;
- `PRIVACY_RETENTION_DELETION_EVIDENCE_DAYS`;
- `PRIVACY_RETENTION_OAUTH_CODE_HOURS`;
- `PRIVACY_RETENTION_OAUTH_TOKEN_DAYS`;
- `PRIVACY_RETENTION_IDEMPOTENCY_DAYS_AFTER_EXPIRY`.

With approved values present, `PRIVACY_RETENTION_EXECUTION_ENABLED=false` produces dry-run metrics. Execution may be enabled only after a reviewed dry run, backup verification, alerting check, and production change record.

## Production cutover gates

Keep `PRIVACY_DELETION_EXECUTION_ENABLED=false` until all gates are evidenced:

1. apply and verify the additive migration on an isolated database;
2. run cross-user export, request, job-status, legal-hold, and RLS tests;
3. create a synthetic reviewer account with private photo objects and each canonical domain;
4. process that account in a non-production project and verify row/object counts;
5. prove backup restore readiness;
6. approve retention periods, legal-hold authority, provider adapters, support escalation, and notification sender;
7. review the irreversible stage and enable the flag in a controlled production window.

## Rollback and forward-fix

- Before `deleting_storage`: disable the worker flag. A queued/failed job can be returned to `deletion_pending` or `active` after an owner-reviewed cancellation; remove the Auth ban with the server admin API, while revoked ChatGPT access remains safely revoked and can be reconnected by the user.
- After Storage deletion begins: do not claim rollback. Stop new jobs, preserve the job evidence, restore objects only from a verified backup if available, and continue with a reviewed forward-fix.
- After Auth deletion: the user ID and application rows are gone. Do not recreate an account as a rollback. Complete notification/audit repair from the surviving job, investigate the incident, and require a new registration if the former user returns.
- Migration rollback must not rewrite applied history. Use an additive forward-fix migration to correct schema/function behavior. Do not drop lifecycle tables while queued, held, retrying, or failed jobs exist.

## Manual actions and unresolved launch decisions

- Owner/legal: approve concrete retention periods, legal-hold authority, completion-evidence duration, and legal wording.
- Supabase: apply/verify the migration, review Data API exposure and RLS/grants, confirm JWT expiry, run advisors, and verify backups.
- Vercel: configure `CRON_SECRET`, the notification encryption key, reviewed retention values, and keep destructive flags false until cutover approval.
- Resend: verify the sender and support/security reply path; otherwise completion notifications remain `not_configured`.
- Provider owners: implement remote revocation adapters before any legacy provider connection is eligible for deletion.
