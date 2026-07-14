# Follow-up design: bounded authenticated Today projection

**Status:** Design only; not implemented in the production-incident branch  
**Reason:** The dashboard incident is closed through state-stability regression coverage. A broad data-architecture rewrite would increase release risk and is not required for that closure.

## Objective

Replace the browser’s broad Today-dashboard query fan-out with one authenticated, minimum-data projection while preserving partial-error semantics and the Quick ChatGPT context contract.

## Current measured baseline method

The authenticated release smoke records, separately for populated and empty synthetic accounts:

- dashboard request count;
- total route-suite request count;
- response `Content-Length` totals where available;
- route durations;
- failed requests;
- HTTP 5xx responses;
- page and console errors.

The initial fail-safe budgets are deliberately generous:

- dashboard: maximum 80 requests;
- full authenticated route suite: maximum 350 requests.

These budgets detect a large accidental increase; they are not performance targets. After the first approved non-production and production synthetic runs, retain observed counts and define p50/p95 budgets from evidence rather than estimates.

## Proposed contract

Create a server-side authenticated projection, for example:

```text
GET /api/dashboard/today?date=YYYY-MM-DD
```

The route must derive the user identity from the authenticated session. It must never accept a caller-supplied user ID.

Return only fields used by the Today view and Quick ChatGPT dashboard context:

- release/request metadata;
- requested local date;
- nutrition totals and target-state summary;
- hydration total/target summary;
- current meal-plan item summary;
- active/default workout-plan day summary;
- current/open/completed workout state summary;
- grocery counts and at most the bounded visible item subset;
- wellness counts and current recovery summary;
- progress-entry count;
- boolean profile-context availability flags;
- per-domain load status and safe error code.

Do not return unrelated profile text, email, raw notes, full history, full plans, private health context, ChatGPT tokens, or provider credentials.

## Partial-error semantics

The response must not fail the whole dashboard when one optional domain fails. Use a domain envelope:

```json
{
  "nutrition": { "state": "loaded", "value": {} },
  "workout": { "state": "failed", "errorCode": "workout_unavailable" }
}
```

The top-level route may return:

- `200` when the projection is authenticated and at least the shell can render;
- `401/403` for session/account-access failure;
- `503` only when identity or the projection boundary itself cannot be established.

Never expose raw database error messages to the browser.

## Query requirements

- one authenticated user identity per request;
- explicit local-date input validated as ISO date;
- bounded ranges only;
- no query per meal item, exercise, grocery item, progress photo, or signed asset;
- batch child rows by parent IDs;
- select explicit columns rather than `*`;
- use existing owner/date/status indexes where supported;
- preserve archived and terminal-history rules;
- avoid generating or refreshing signed URLs unless the visible projection requires them;
- do not call external providers in the projection.

## Quick ChatGPT compatibility

The projection should return a dedicated `promptContext` summary matching `QuickPromptContext` semantics. The client provider must continue to suppress structurally equivalent updates. The projection must not broaden permissions: it describes state already visible on Today and does not grant ChatGPT access by itself.

## Caching and privacy

- `Cache-Control: private, no-store` initially;
- no shared CDN caching;
- no user ID in URL or logs;
- no response persistence in telemetry;
- request IDs may be logged with domain status and duration only;
- verify account deletion/access state before querying domains.

## Rollout

1. Add projection contract and service tests behind an internal feature flag.
2. Compare old/new projection values for synthetic accounts without switching rendering.
3. Add query-count and no-N+1 tests.
4. Run empty, typical, and high-history synthetic cases.
5. Validate partial-domain failures.
6. Switch Today data loading while retaining the old path as a short-lived rollback path.
7. Remove the old fan-out only after production synthetic evidence and rollback review.

## Acceptance targets to define from evidence

After baseline collection, set targets for:

- dashboard request count;
- transferred bytes;
- server duration p50/p95;
- browser time to primary Today content;
- query count per projection;
- zero N+1 growth as meal/exercise/history fixture sizes increase.

No target should be invented before evidence is retained.
