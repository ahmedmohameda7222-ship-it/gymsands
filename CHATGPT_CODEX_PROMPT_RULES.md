# Plaivra Codex Prompt Authoring Rules

Use this file when preparing an implementation or correction prompt.

## Core workflow

1. Planner inspects the real repository and approves one bounded scope.
2. One Codex executor implements that scope on one branch and one PR.
3. Codex runs local validation, pushes, and stops.
4. Independent quality control reviews the actual diff, CI artifacts, database evidence, comments, reviews, and mergeability.
5. Corrections stay in the same Codex chat and branch. A new phase uses a new chat and branch.
6. Merge, deployment, production migration, and later phases require separate explicit authorization.

## Prompt structure

Every prompt must contain:

- role and exact objective;
- base SHA, branch, and PR boundary where known;
- approved requirements;
- preservation constraints;
- non-goals;
- must-read files;
- search-only areas;
- conditional expansion rules;
- explicit do-not-read areas;
- database/security/release boundaries;
- acceptance criteria;
- exact validation commands or repository-standard checks;
- commit/push/report expectations;
- stop boundary.

## Bounded inspection protocol

### Must read

List only direct contracts, implementation files, tests, migrations, and current authority required for the task.

### Search only

Name directories or concepts that should be inspected with `rg` or equivalent before opening files.

### Conditional expansion

Allow additional reads only for:

- direct imports/callers;
- failing tests;
- database ownership, RLS, grants, export, deletion, or foreign keys;
- established repository conventions;
- release and CI contracts directly affected by the change.

Codex must record every additional file and why it was inspected.

### Do not read

Exclude unrelated domains, historical prompts/reports, generated evidence, and future phases.

## Model and agent selection

Use the most economical model and reasoning level that can meet the task. Repository size alone does not justify the strongest model.

Agents are off by default. Use one executor. Add one specialist only when a real independent security, database, or review workstream exists. Ruflo swarms and autopilot are not defaults.

## Plugin selection

- `@GitHub` — repository, PR, review, CI, and merge evidence;
- `@Supabase` — connected schema, policies, migration metadata, and authorized database operations;
- `@Vercel` — deployment and runtime evidence;
- no plugin for purely local repository work.

Production access is read-only unless the prompt and user explicitly authorize a specific mutation.

## Graphify

Use Graphify after clean merged architecture phases to update dependency context. Graph output is advisory and must be verified against source, tests, SQL, and runtime evidence.

## Required CI failure behavior

Include this verbatim whenever CI is required:

```text
If any required CI check fails, is cancelled, times out, or requires action, output exactly:

Send me the correction prompt.

Then stop immediately. Do not investigate the failure, rerun CI, modify files, download logs or artifacts, update the report, or add any explanation.
```

Pending CI is not a reason to wait idly. Codex completes local work, pushes, reports the pending state allowed by the prompt, and stops.

## Standard preservation rules

- never rewrite applied migrations;
- do not mutate production without explicit authorization;
- preserve auth, ownership, RLS, privacy, consent, accessibility, data integrity, and rollback;
- do not merge or deploy unless explicitly instructed;
- do not start the next phase;
- do not claim success before tools or tests confirm it;
- do not create new historical status documents or commit generated QA artifacts.

## Final handoff

When all required checks pass, Codex reports:

- starting and final SHAs;
- changed files;
- exact scope completed;
- validation actually run;
- database/production/deployment status;
- PR URL and state;
- remaining limitations;
- confirmation that no out-of-scope work occurred.
