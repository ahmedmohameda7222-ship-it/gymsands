# P8A Single Workout PDF Report Authority

## Status

P8A is active and bounded to one server-generated PDF for one owner-accessible performed Workout History session. P6B live acceptance and P7 notifications remain deferred by the owner. P8B remains later. PCS-5 backup/restore remains deferred and is not closed.

## User contract

A signed-in member can open a performed Workout History detail page and select one localized **Download PDF** action. The page remains open, the scroll position is preserved, and exactly one authenticated request is made while the action is busy.

The canonical endpoint is:

```text
GET /api/workouts/history/performed/{sessionId}/report?language=en|de|ar&timezone={IANA timezone}
```

A successful response is an attachment named:

```text
plaivra-workout-report-YYYY-MM-DD.pdf
```

The date is derived from the saved workout timestamp in the requested timezone. Successful and failed responses are private and non-cacheable.

## Data authority and privacy

The route:

1. requires the existing bearer-token member authentication authority;
2. uses the authenticated, RLS-bound Supabase client;
3. calls the canonical Workout History performed-session detail reader directly;
4. preserves the canonical detail summary, including reliable volume and unavailable values, without a second metric read or formula;
5. never uses a service-role client, HTTP self-call, browser-provided workout payload, or scheduled fallback record.

The report model deliberately excludes user IDs, session IDs, snapshot IDs, plan IDs, set IDs, record IDs, tokens, cookies, authorization headers, database errors, internal relation names, and hidden repair/projection facts. Saved nulls remain unavailable rather than becoming zero.

## Report content

The A4 report contains:

- Plaivra branding, localized report label, generated timestamp, page numbering, privacy reminder, and tagline;
- workout title, saved workout date/time, lifecycle, category when saved, and a statement that the report represents saved Plaivra history;
- duration, exercise count, performed sets, planned sets when authoritative, completed/planned comparison, reliable volume, and verified-record count;
- deterministic highlights based only on saved facts;
- performed, missing planned, and unplanned sets;
- replacement context, set type, planned target, actual result, RPE/RIR, verified-record presence, and saved notes;
- continuation headings and repeated set columns when an exercise spans pages.

Muscle heat-map screenshots and other rasterized application UI are intentionally excluded. P8A does not create new fitness calculations.

## Localization and font authority

Localized and user-entered text uses repository-vendored open-license Noto Sans and Noto Sans Arabic Regular/Bold TTF assets. The PDF renderer registers the vendored `@pdf-lib/fontkit@1.1.1` runtime. Unicode bidi run ordering is handled by vendored `bidi-js@1.0.3`; Arabic text remains in logical order inside each run so fontkit owns contextual shaping. German umlauts and `ß`, Arabic letters and digits, and mixed Arabic/Latin/numeric strings are covered by automated tests. `package.json` and `package-lock.json` are unchanged.

Third-party notices and source identities are recorded in [`lib/reports/pdf/THIRD_PARTY_NOTICES.md`](../../lib/reports/pdf/THIRD_PARTY_NOTICES.md). No font or shaping asset is downloaded at request time.

## Explicit bounds and failure behavior

Generation fails closed with `REPORT_TOO_LARGE` before or during rendering when any configured exercise, set, note, page, byte, or generation-time limit is exceeded. The renderer never silently truncates a saved workout.

Invalid language/timezone input returns safe `400` JSON. Missing or owner-inaccessible sessions return safe `404` JSON. Authentication and account-state denials preserve their existing status. Unexpected reader or renderer failures return safe `5xx` JSON without content-bearing logs or internal errors.

## Verification authority

P8A adds focused model, font coverage, bidi, PDF loadability, route, download-client, and UI contract tests. The Workout History rendered-QA command preserves the existing full Workout History suite, then runs P8A-specific EN/DE/AR evidence across desktop, tablet, and mobile viewports, including successful download, slow-request busy state, failure recovery, safe filename, single request, no navigation/scroll movement, no horizontal overflow, and performed-only visibility.

## Non-goals

P8A does not add weekly/monthly reports, CSV export, email delivery, report storage, report history, signed report URLs, clinician/coach portals, scheduled report jobs, a reporting dashboard, notification delivery, backup/restore closure, deployment, or Production/provider mutations.
