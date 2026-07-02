# Plaivra Privacy Retention and Deletion Plan

Status: Phase 6 implementation draft. This document is operational groundwork, not a claim that every cleanup job is active. Final legal and privacy review is required before public launch.

## Current behavior

| Data | Current behavior | Phase 7+ action |
|---|---|---|
| Account/profile | Retained until an owner-scoped deletion request is completed or a legal reason requires retention | Define and test the admin-reviewed purge runbook, including Supabase Auth session revocation before user deletion |
| Fitness/nutrition/wellness | User-controlled rows are retained until individually deleted or the account purge is completed | Add a two-user deletion test and verify every foreign-key cascade |
| Progress photos | Private `progress-photos` bucket; owner folder enforced; current delete path removes the owner-scoped row and storage object | Include bulk folder deletion in the reviewed account purge runbook |
| OAuth authorization codes | Five-minute application expiry; only the hash is stored | Add a scheduled delete for expired/used rows after an approved retention window |
| OAuth access tokens | Seven-day application expiry; only the hash is stored; revoked connections fail closed | Add a scheduled delete for expired tokens after an approved diagnostic window |
| ChatGPT connection metadata | Active until revoked; revoked metadata remains for security/accountability | Set and document a final follow-up retention period |
| MCP audit logs | Redacted but currently have no automatic expiry | Select a final security/accountability period, document the legal basis, and implement bounded deletion |
| Privacy requests | Retained to process and demonstrate handling of rights requests | Set a post-completion retention period after legal review |
| Consent records | Versioned grant/revocation history is retained for accountability | Retain only as long as needed to demonstrate the consent lifecycle and resolve claims |

## Safety requirements for cleanup

1. Do not delete production data merely because an application timestamp has expired; deploy and verify cleanup in a controlled migration or scheduled job.
2. Cleanup must be bounded by table, status, and timestamp and must never accept a client-supplied user ID without authenticated ownership or admin authorization.
3. Account deletion must first revoke ChatGPT connections and Supabase sessions, then delete private storage objects, then remove database/auth records in a reviewed order.
4. Export and deletion tests must use two users to prove that one user cannot export, request, or delete another user’s data.
5. Cleanup logs must contain counts and internal identifiers only, never tokens, authorization codes, prompts, photos, notes, measurements, or exported user payloads.

## Not activated in Phase 6

- No destructive cleanup job or cron schedule was created.
- No live Supabase migration was applied.
- No automatic hard-delete endpoint was added.
- Final retention durations remain launch blockers pending legal and operational review.
