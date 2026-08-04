# Today dashboard query fan-out

**Historical baseline measured:** 2026-07-10 by static call-site inspection
**Runtime health verified:** PCS-3B merged and deployed at `517e37ccd7252e040c652da72e155b3dcb5d5bda`
**Production request/latency evidence:** pending PCS-3C.2

Before PCS-3B, the Today dashboard started independent browser loaders for workout, meal-plan items, nutrition logs and targets, hydration, grocery, habits, supplements, sleep, profile prompt context, and progress prompt context. Several domain services performed more than one Supabase query, so one Today operation produced broad browser-to-Supabase fan-out, duplicated authentication/network overhead, and independently published source state.

Parallelism reduced some critical-path delay, but the architecture remained a launch performance and consistency risk on mobile networks. No latency improvement is claimed from static inspection or implementation tests.

## PCS-3B deployed architecture

PCS-3B replaced the historical initial read fan-out with one authenticated browser request:

```text
GET /api/dashboard/today?date=YYYY-MM-DD&timezone=<IANA timezone>
```

The deployed architecture:

- derives the owner from `requireUser(request)` and uses its RLS-bound Supabase client;
- returns one versioned minimum-data contract with safe partial-domain envelopes;
- coordinates bounded server-side domain readers concurrently;
- keeps server query count constant as exercise, meal, grocery, habit, supplement, and sleep fixture cardinality grows;
- aggregates food logs and hydration on the server;
- returns only bounded workout and wellness previews;
- keeps canonical domain mutation authorities and updates the local projection from authoritative mutation results;
- removes the old browser fan-out rather than retaining dual loading or a feature-flag rollback path;
- performs no external-provider request, service-role read, migration, or persistent browser projection caching.

The fixed test-fixture operation counts prove constant query count and no N+1 behavior. They are not Production latency measurements.

## Runtime-health boundary

Immediate post-deployment health was verified at the PCS-3B merge baseline: the deployment was READY, `/api/version` returned HTTP 200, the unauthenticated Today route failed safely with HTTP 401, required contract/privacy/correlation headers were present, and no immediate runtime-error cluster was observed.

This verifies release health only. It does not prove Production request counts, response sizes, or p50/p95 values.

## PCS-3C measurement boundary

PCS-3C.1 establishes the durable read-only measurement harness and safe route timing authority. No Production measurement is run in PCS-3C.1. PCS-3C.2 must later record reviewed Production request counts, decoded bytes and Content-Length where available, browser duration p50/p95, safe server duration p50/p95, failures, and interaction evidence against approved synthetic accounts.

No Production performance claim or latency budget is approved before PCS-3C.2 evidence exists.

Regression gate: Today must retain one browser projection request per owner/date/timezone operation, zero direct initial Supabase reads from Today, safe partial failures, and constant server query count with collection cardinality.
