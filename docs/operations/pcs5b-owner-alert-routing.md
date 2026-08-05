# PCS-5B GitHub-Native Owner Incident Alert Routing Authority

## Purpose

PCS-5B converts repeated failures from the repository-owned Production synthetic into one durable owner-visible GitHub incident and resolves that incident after a later successful synthetic run.

The authority is GitHub-native and intentionally uses the existing repository issue tracker as the first alert destination. It adds no external monitoring vendor, webhook, email credential, Supabase credential, or user-data path.

## Trusted source workflow

The routing workflow is:

```text
Production owner alert routing
```

It listens only to completed runs of:

```text
Production uptime synthetic
```

A source run is accepted only when:

- the workflow name is exact;
- the source repository and head repository equal the current repository;
- the source branch is `main`;
- the source event is `push`, `schedule`, or `workflow_dispatch`;
- the conclusion is recognized;
- the workflow ID, run ID, run number, run attempt, and GitHub URL are valid.

Source chronology is established by the explicit tuple `(run_number, run_attempt)`. A higher run number is newer; within one run number, a higher run attempt is newer. GitHub API array order and completion timestamps are not chronology authorities. A conflicting run ID for one run number is treated as an invalid API state.

The workflow checks out only the trusted default-branch implementation. It never checks out or executes the source run's commit and never downloads source artifacts, logs, or response bodies.

## Failure threshold

Actionable conclusions are:

- `failure`;
- `timed_out`;
- `action_required`;
- `stale`;
- `startup_failure`.

For every non-ignored completion, the router validates and normalizes recent source history before accessing issues. If a newer relevant completion attempt exists, the current event is stale and is ignored before any issue listing or mutation.

The first actionable failure after a success, or without a prior relevant run number, records `first_failure` and does not open an issue.

A second consecutive relevant actionable workflow run reaches the SEV-1 threshold and opens or updates the active incident. Rerun attempts of one workflow run are replacement states for that run number; two attempts of the same run do not count as two consecutive failures. The threshold predecessor is the greatest relevant run number lower than the current run number, using its latest available attempt.

Ignored conclusions are:

- `cancelled`;
- `neutral`;
- `skipped`.

Ignored runs do not count toward consecutive-failure state. In particular, cancellation is expected when a newer `main` push supersedes an older PCS-5A convergence run.

## One-open-incident model

The active issue title is:

```text
[SEV-1] Production synthetic repeatedly failing
```

The issue body contains this repository-owned identity marker:

```html
<!-- plaivra-production-alert:uptime-synthetic -->
```

The issue:

- is assigned to the repository owner;
- uses the existing `bug` label;
- represents one unresolved incident episode;
- is updated for later actionable failures rather than duplicated;
- is never reopened for a later independent episode.

When no open marker issue exists and a new two-failure episode reaches threshold, a new issue is created.

## Idempotency

Every persisted completion attempt contains the attempt-level marker:

```html
<!-- plaivra-production-attempt:<run_id>:<run_attempt> -->
```

The existing run marker may remain for human-readable run identity, but it is not the deduplication authority. Before adding a comment, the router inspects the active issue body and existing comments for the exact attempt marker. Reprocessing the same `(run_id, run_attempt)` does not create a duplicate issue or comment, while a later rerun attempt remains a distinct completion event.

## Recovery

A successful non-stale source completion searches for the active marker issue.

- If no active issue exists, no mutation occurs.
- If an active issue exists, one attempt-idempotent recovery comment is added and the issue is closed.
- A successful later attempt of the same run is distinct from an earlier failed attempt and can recover the incident.
- An older success is ignored when a newer relevant completion already exists, so it cannot close newer incident state.

Automatic closure records that the Production synthetic recovered. It does not replace root-cause review, evidence preservation, or corrective action for a real outage.

## Evidence safety

Issue bodies, comments, stdout JSON, and the GitHub step summary contain only bounded operational metadata:

- severity and state;
- source workflow name;
- source run ID, run number, run attempt, and GitHub URL;
- source event and recognized conclusion;
- exact head SHA when reported;
- safe timestamps;
- nearest previous relevant run identity;
- bounded ignored reason for stale or non-actionable completion events;
- detection threshold;
- incident-response document path;
- statement that PCS-5A evidence remains attached to the source workflow run.

The authority does not retain raw logs, API bodies, artifact bodies, stack traces, tokens, cookies, authorization headers, email addresses, user IDs, UUID record identifiers, query strings, provider payloads, user content, or workout, nutrition, or health data.

GitHub API and network failures produce stable safe process errors. Raw API response bodies are never printed.

## Permissions

The routing workflow has exactly:

```yaml
permissions:
  actions: read
  contents: read
  issues: write
```

The temporary `GITHUB_TOKEN` is passed only to the routing process through its environment. It is never printed or persisted.

Routing is serialized through one concurrency group and routing failures remain visible as failed workflow runs.

## Security boundary of `workflow_run`

`workflow_run` can be dangerous when a privileged follow-up executes untrusted source-run code. PCS-5B avoids that boundary by:

- accepting only the exact repository-owned source workflow;
- enforcing repository, head-repository, branch, and event guards;
- checking out the trusted default branch only;
- never using the source `head_sha` as executable code;
- never downloading source artifacts or logs;
- validating the event again inside the routing script before any issue mutation.

## What a pass proves

A passing PCS-5B decision proves only:

> Repeated failures from the repository-owned Production synthetic are converted into one durable owner-visible GitHub incident, and a later successful synthetic resolves that incident.

## Limitations

PCS-5B is GitHub-native and is not independent of GitHub availability. GitHub account notification preferences may prevent or delay email delivery even when the owner-visible issue exists.

PCS-5B does not provide:

- independent external monitoring;
- runtime-log or client-error clustering;
- elevated 5xx alerting outside the Production synthetic;
- OAuth, MCP, deletion, retention, billing, or webhook alert coverage;
- provider deployment inspection;
- database backup availability;
- restore readiness;
- final Production launch authorization.

## Backup and restore boundary

PCS-5B creates no Production backup, database dump, GitHub artifact containing user data, Supabase project or branch, paid plan upgrade, PITR configuration, or restore rehearsal.

Production backup data requires either an approved encrypted off-site destination with key-management authority or an approved provider plan with backup and restore capability. Neither decision is authorized in PCS-5B. Schema-only CI replay is not backup or restore evidence.
