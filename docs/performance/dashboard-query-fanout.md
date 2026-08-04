# Today dashboard query fan-out

**Historical baseline measured:** 2026-07-10 by static call-site inspection
**Runtime latency claim:** none; Production tracing for PCS-3B is deferred to PCS-3C

Before PCS-3B, the Today dashboard started independent browser loaders for workout, meal-plan items, nutrition logs and targets, hydration, grocery, habits, supplements, sleep, profile prompt context, and progress prompt context. Several domain services performed more than one Supabase query, so one Today operation produced broad browser-to-Supabase fan-out, duplicated authentication/network overhead, and independently published source state.

Parallelism reduced some critical-path delay, but the architecture remained a launch performance and consistency risk on mobile networks. No latency improvement is claimed from static inspection or implementation tests.

## PCS-3B implementation candidate

PCS-3B replaces the historical initial read fan-out with one authenticated browser request:

```text
GET /api/dashboard/today?date=YYYY-MM-DD&timezone=<IANA timezone>
```

The candidate:

- derives the owner from `requireUser(request)` and uses its RLS-bound Supabase client;
- returns one versioned minimum-data contract with safe partial-domain envelopes;
- coordinates bounded server-side domain readers concurrently;
- keeps server query count constant as exercise, meal, grocery, habit, supplement, and sleep fixture cardinality grows;
- aggregates food logs and hydration on the server;
- returns only bounded workout and wellness previews;
- keeps canonical domain mutation authorities and updates the local projection from authoritative mutation results;
- removes the old browser fan-out rather than retaining dual loading or a feature-flag rollback path;
- performs no external-provider request, service-role read, migration, or persistent browser projection caching.

The fixed test-fixture operation counts are documented in PR evidence. They are regression evidence for constant query count and no N+1 behavior, not Production latency measurements.

## Remaining Production evidence

PCS-3C must record Production request counts, transferred bytes where available, route duration p50/p95, failures, and browser-visible errors against approved synthetic accounts. No Production performance claim or budget reduction is approved before that evidence exists.

Regression gate: Today must retain one browser projection request per owner/date/timezone operation, zero direct initial Supabase reads from Today, safe partial failures, and constant server query count with collection cardinality.
