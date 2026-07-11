# Supabase launch security and performance baseline

**Project:** `bkwezjxvapaeasfvlhvv`  
**Captured read-only:** 2026-07-10  
**State:** Pre-migration baseline; no production DDL was applied

## Security advisor

The production advisor reported six findings:

- four informational `rls_enabled_no_policy` findings for the OAuth code/token and MCP/OAuth rate-limit tables. Production grants show only `postgres` and `service_role`; no `anon` or `authenticated` grants exist. The no-member-policy state is intentional and receives an explicit grants regression in the pending migration;
- one warning because `public.is_admin()` is an authenticated-callable `SECURITY DEFINER` RPC. The pending migration moves it to non-exposed `private`, fixes its `search_path`, updates RLS/trigger references, revokes public/anonymous access, and drops the public RPC;
- leaked-password protection is disabled. This requires a manual Supabase Auth dashboard action and must remain a launch blocker until enabled and rechecked. See the [Supabase password security guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

The `private` schema must not be added to API exposed schemas. After isolated and production application, rerun the [Supabase security advisor](https://supabase.com/docs/guides/database/database-linter) and archive the result with the release manifest.

## Storage review

Production has one bucket, `progress-photos`. It is private, limited to 10 MiB, and accepts JPEG, PNG, and WebP. Object policies bind the first path segment to `(select auth.uid())` for select/insert/update/delete. The application constructs UUID-owner-prefixed paths and uses one-hour signed URLs. Cross-user storage tests are still required on the isolated database.

## Performance advisor

The baseline reported 163 items:

| Category | Count | Classification |
| --- | ---: | --- |
| unindexed foreign keys | 43 | add only launch-query/cascade indexes; defer cold/compatibility paths pending query evidence |
| RLS auth initplan | 54 | pending policy rewrite caches `auth.uid()`, `auth.role()`, `auth.jwt()`, and the private admin helper |
| unused indexes | 37 | retain; a pre-launch snapshot is not adequate evidence for deletion |
| multiple permissive policies | 27 | proven exact duplicates and own/admin SELECT pairs consolidated; catalog/admin overlaps require isolated semantic tests before broader consolidation |
| duplicate indexes | 2 | retain pending constraint definitions, `pg_stat_user_indexes` observation across a representative window, and query-plan comparison |

The pending migration adds covering indexes for OAuth revocation/cleanup, food-log and meal-plan joins, progress-photo cascades, workout plan/session links, scheduled exercise links, and saved-recipe ownership. It intentionally does not mass-delete unused indexes.

## Required post-migration evidence

1. Run the migration chain on an isolated Supabase database.
2. Execute the grants/RLS/cross-user suites and verify the service role is absent from client chunks.
3. Rerun both advisors and classify every remaining item.
4. Capture `EXPLAIN (ANALYZE, BUFFERS)` only with synthetic data or redacted aggregate output.
5. Require owner review before applying production DDL.
