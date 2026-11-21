# Plaivra Nutrition / Food Catalog RPC grant surface — direct Production metadata census

**Observed 2026-11-21 03:16:29.489292 UTC**, PLAIVRA Main Supabase `bkwezjxvapaeasfvlhvv`. **SELECT-only; no RPC executions, privilege changes, user impersonation, audit inserts or Production writes.** Follow-up to `nutrition-privacy-rls-readonly-census-2026-11-21.md` (17 Nutrition owner-scoped RLS tables / 49 policies).

## Exact metadata scope

PostgreSQL `pg_proc` joined to `pg_namespace` for only `public` and `private`, where function names contain `nutrition`, `food_catalog` or `food_ingestion`. Counts are **overload-specific function rows**, not distinct names. Evaluated `prosecdef`, `has_function_privilege('anon'|'authenticated',oid,'EXECUTE')`, `has_schema_privilege('anon',schema_oid,'USAGE')` and textual `pg_get_functiondef` presence of `auth.uid()`. Schema privilege and function privilege are distinct; do not conflate direct DB privileges with external PostgREST exposed-schema configuration or policy enforcement.

| Schema | Matching function signatures | SECURITY DEFINER | anon EXECUTE privilege | anon EXECUTE **and** schema USAGE | anon-callable SECURITY DEFINER by these DB grants | authenticated EXECUTE on SECURITY DEFINER |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `public` | 85 | 77 | 0 | 0 | 0 | 48 |
| `private` | 64 | 36 | 12 | 0 | 0 | 0 |

The 12 `private` functions with `anon EXECUTE` have **no anonymous schema USAGE**; they are non-definer helpers/triggers (search numeric match/normalization, GTIN validator, immutable-fact guards). This **does not establish external anonymous RPC access**. None of the scoped `public` functions grant anonymous EXECUTE at this snapshot.

## Security-sensitive follow-up classification

Of the 48 `public` SECURITY DEFINER functions executable by `authenticated`, **16 do not contain the literal substring `auth.uid()` inside their own top-level function body**. The list includes Food Catalog governance, correction, barcode and lifecycle functions. Several explicitly invoke delegated governance mechanisms; a regex text count **cannot distinguish delegated authorization from no authorization**. Source-first trace into each called helper, role checks, actor provenance, lease and idempotency conditions is required before any risk or approval claim.

Neither an `authenticated` EXECUTE grant nor a missing inline `auth.uid()` proves an authorization bypass, and service-side RLS may differ due to SECURITY DEFINER ownership. No change to grants, FORCE RLS or published migrations is authorized from this census. Prior read-only RLS predicates, privacy exports and owner-filtered HTTP queries are separate layers of evidence, **not runtime proof**.

## Remaining final acceptance

1. Verify `SECURITY DEFINER` source and nested capability chains using immutable migrations/live function definitions, including `search_path`, owner roles, and callable branch limits.
2. Use isolated disposable two-owner JWTs and an anonymous context for **actual allow/deny** trials across published Food Catalog governance and user-owned Diary/Recipe/Saved Meal/MCP contracts. Never use unapproved real Production users or change live principals.
3. Confirm exact required grant/scheme on the reviewed final release candidate and source code SHA; negative proof must include frozen snapshot and no cross-owner data leakage under retries.

**Disposition: N097 RPC grant metadata VERIFIED READ-ONLY; behavioral authorization NOT VERIFIED.** Production unchanged.
