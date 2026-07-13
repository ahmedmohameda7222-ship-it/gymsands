# Today dashboard query fan-out

**Measured:** 2026-07-10 by static call-site inspection  
**Runtime latency claim:** none; no production tracing was available

The current Today dashboard starts 19 independent domain-service reads in one `Promise.all`, then performs one schedule-dependent open-session read and one independent ChatGPT-connection request. Several domain services perform more than one Supabase query, so the browser-level fan-out is greater than 21 requests. The code does not issue a per-list-item database query in the dashboard render path; the primary problem is broad parallel fan-out, duplicated ranges, and client-side aggregation.

This is a launch performance risk on mobile networks even though parallelism reduces the critical path. The milestone does not invent latency numbers.

## Bounded remediation

- Canonical owner/date/status indexes are added for the highest-frequency joins and cascades.
- The dashboard continues to use bounded queries rather than unbounded row reads.
- A server-side, authenticated `today` projection should replace the fan-out after Workstream 6 projection contracts are in place. It must return only Today/weekly-preview fields, use one user identity, and preserve partial-error semantics.
- Connection status should be included in that server projection rather than fetched after the main dashboard state.
- Before launch, browser tracing must record request count, transferred bytes, and p50/p95 server timing against synthetic accounts at low, typical, and high history volumes.

Regression gate: the consolidated projection must not introduce N+1 reads for meal items, workout exercises, progress photos, or signed URLs.
