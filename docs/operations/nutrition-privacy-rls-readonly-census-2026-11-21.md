# Plaivra Nutrition privacy — Production RLS read-only policy census

**Observed 2026-11-21 · Source: direct Main Supabase metadata SELECT only.** Project `bkwezjxvapaeasfvlhvv`. This is a metadata inspection, not a live test of cross-owner access, access revocation or SECURITY DEFINER RPC correctness. No test accounts, fixtures, writes, policy modifications or migrations were created.

## Metadata query family

```sql
SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
       count(p.policyname) AS policy_count
FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
LEFT JOIN pg_policies p ON p.schemaname=ns.nspname AND p.tablename=c.relname
WHERE ns.nspname='public' AND c.relkind IN ('r','p')
  AND c.relname LIKE 'nutrition_%'
GROUP BY c.relname,c.relrowsecurity,c.relforcerowsecurity;

SELECT count(DISTINCT tablename) AS tables_with_policies,
       count(*) AS policy_total,
       count(*) FILTER (WHERE 'authenticated'=ANY(roles)) AS authenticated_policy_count,
       count(*) FILTER (
         WHERE COALESCE(qual,'') NOT LIKE '%auth.uid()%'
           AND COALESCE(with_check,'') NOT LIKE '%auth.uid()%'
       ) AS policies_without_explicit_auth_uid,
       count(*) FILTER (
         WHERE cmd IN ('INSERT','UPDATE')
           AND COALESCE(with_check,'') NOT LIKE '%auth.uid()%'
       ) AS write_policies_without_check_uid
FROM pg_policies
WHERE schemaname='public' AND tablename LIKE 'nutrition_%';
```

## Direct observations

- **17/17** `public.nutrition_%` tables have `relrowsecurity=true`; all reported `relforcerowsecurity=false`. `FORCE RLS` is not inferred. SQL owner and privileged service roles can bypass normal RLS; these results are not proof of enforcement against them.
- **49** Nutrition policies in this schema, **49/49** apply to `authenticated`; **0/49** have neither `auth.uid()` in `USING` nor `WITH CHECK`; **0** INSERT/UPDATE policies lack an explicit `auth.uid()`-based WITH CHECK. Examined actual `qual` and `with_check` predicates, not just policy names; read projections are user-id filtered, ordinary writes check authenticated owner. Recipe draft child insertion also checks that the parent draft belongs to the same owner.
- Published `nutrition_recipe_versions` and logged Diary tables expose owner-scoped SELECT without direct app-user published-version/diary INSERT policy: canonical writes are through separately reviewed RPCs; **absence of direct INSERT policy is not a missing access grant**.

## Deliberate limitations

- No disposable DB RLS deny/allow replay using two users, no JWT or role impersonation, no SECURITY DEFINER definer/EXECUTE grant review, no export/delete end-to-end, no successful MCP cross-owner isolation test. Metadata is not actual runtime denial proof.
- G-11 N106 and independent N112 security acceptance are still required. Production Food generation remains empty and is unrelated to user-owned historical Nutrition rows.

**Disposition: RLS_METADATA_READ_ONLY_STRONGLY_OWNER_SCOPED / RUNTIME_UNTESTED.**
