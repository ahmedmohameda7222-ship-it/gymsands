# Supabase advisor evidence classification — July 2026

**Scope:** Production-incident remediation review only  
**Database changes in this branch:** None  
**Production advisor settings changed:** None

Advisor output is a review input, not automatic authorization to change grants, RLS, indexes, or authentication settings. Every database correction must remain forward-only and evidence-backed.

## Security findings

| Finding | Evidence reviewed | Classification | Branch action | Required follow-up |
|---|---|---|---|---|
| `complete_meal_plan_item(uuid)` is an authenticated `SECURITY DEFINER` RPC | Repository migration uses `auth.uid()`, selects the item by `id` and caller `user_id`, checks linked food-log ownership, hardens `search_path`, revokes `public`/`anon`, and grants `authenticated` | Intentional browser-callable RPC with explicit ownership enforcement | Added disposable-database owner, cross-user, idempotency, grant, anonymous-denial, and search-path tests | Retain grant while tests pass; investigate any future definition drift before changing access |
| `complete_meal_plan_item_with_values(...)` is an authenticated `SECURITY DEFINER` RPC | Same caller-owned item selection, validation, owner-scoped linked-log lookup, hardened `search_path`, authenticated-only execution | Intentional browser-callable RPC with explicit ownership enforcement | Added grant and anonymous-denial coverage; cross-user selection is covered by the shared owner predicate | Retain grant while ownership and argument-validation tests pass |
| `correct_completed_meal_plan_item(...)` is an authenticated `SECURITY DEFINER` RPC | Item and linked food log are both selected by caller `auth.uid()`; hardened `search_path`; anonymous denied | Intentional browser-callable correction RPC with explicit ownership enforcement | Added cross-user negative and grant/search-path coverage | Retain grant while tests pass |
| Leaked-password protection disabled | Supabase Auth advisor warning | External owner configuration defect | No provider mutation performed | Owner must enable leaked-password protection in Supabase Auth, retain a screenshot/audit event, and re-run the advisor |
| Internal service tables have RLS but no member policies | Tables are intended for service-role/server operations in several domains | Potentially intentional deny-all member posture | No policies added | Verify each table’s server-only owner and service-role route; add member policy only when a product requirement proves it necessary |

## Performance and policy findings

| Finding/group | Classification | Reason no incident-branch change was made | Evidence required before correction |
|---|---|---|---|
| Duplicate indexes reported on `food_kitchens` | Requires definition and workload data | Advisor reports an identical pair, but removal affects write paths and rollback planning | `pg_get_indexdef`, constraint ownership, usage counters over a representative window, query plans, and a forward-only drop plan |
| Duplicate indexes reported on `workout_sessions` | Requires definition and workload data | Session lookup paths are release-critical and recently changed | Exact definitions, FK/constraint dependencies, query plans for active/session history paths, and rollback evidence |
| Multiple permissive read policies on global exercise, video, food, and workout libraries | Policy intentionally overlapping unless proven otherwise | Admin-manage plus member/global-read policies can be semantically intentional | Full policy expressions, role matrix, representative `EXPLAIN`, and proof that consolidation preserves admin/member behavior |
| Multiple permissive update policies on `profiles` | Requires ownership-policy review | Admin update and owner-basic update serve different principals | Policy expressions, column-level privileges, cross-user tests, and admin workflow tests |
| Multiple permissive policies on app settings/welcome data | Requires policy review | Admin management and member-visible reads can be intentional | Policy expressions, read volumes, and role-specific integration tests |
| Unindexed foreign keys in admin, billing, privacy, reference, meal, workout, and progress tables | Requires workload data or evidence of cascade/lookup pressure | Bulk index creation increases storage and write cost and may duplicate composite indexes | Existing index coverage, table size, delete/update plans, production p95 queries, and write-amplification estimate |
| Unused indexes | Intentionally retained pending representative traffic | A young/low-traffic database does not provide enough usage history to justify removal | Representative traffic window, restart-aware usage metrics, query plans, and rollback plan |

## Owner evidence checklist

Before any follow-up migration:

1. capture exact production definitions and usage metrics read-only;
2. map each object to its product owner and runtime call sites;
3. demonstrate positive and negative ownership behavior;
4. establish a measured performance or security defect;
5. prepare one isolated forward-only migration;
6. retain rollback/forward-fix steps;
7. run the full migration chain and affected integration tests;
8. obtain independent quality-control approval.

No advisor item in this document is evidence that the production dashboard incident was caused by Supabase security or index configuration.
