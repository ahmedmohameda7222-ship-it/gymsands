# Codex Startup and Refresh Protocol

> Generated: `2026-07-29T15:37:00+02:00`
> Repository: `ahmedmohameda7222-ship-it/gymsands`
> Audited application base: `main@2169527efc3c2cd4210fc358a58c6bce37f1788b`
> Active-work overlay: `PR #90@e4cfca2f909912fa3041cebaf5689944dc655339`
> Freshness: compare repository trees from the audited application base, excluding context-only paths. Exact source, migrations, tests, and workflows remain executable truth.

## Every-task startup

### 1. Read minimal persistent context

Always read:

- `AGENTS.md`
- `docs/codex-context/00_CONTEXT_MANIFEST.md`
- this file
- `docs/codex-context/context_manifest.json`

Then read only the domain file(s) selected by the manifest.

### 2. Verify freshness

Record:

```text
current HEAD
current branch
current main SHA
task base SHA
changed files
latest repository migration
active PR/head when relevant
```

Read `auditedApplicationBase.sha` and `contextOnlyPaths` from the JSON manifest.

Compare repository trees, not commit ancestry:

```bash
git diff --name-only <auditedApplicationBase.sha> HEAD -- . \
  ':(exclude)AGENTS.md' \
  ':(exclude)docs/codex-context/**'
```

Also compare the audited base with current `main` using the same exclusions when the task branch does not contain the latest main.

- No non-context paths changed: application context is fresh.
- Non-context paths changed: map them to domains and inspect only affected context and dependencies.
- Relevant overlay head changed: refresh that overlay even when canonical application paths are unchanged.

The audited SHA intentionally points to an application/source-state commit before the final context-only refresh commit. This prevents the manifest from needing to contain its own commit SHA.

### 3. Choose one path

**Fresh context, unrelated unchanged domain**

Use the context index. Do not rediscover the whole repository.

**Fresh context, editing a known domain**

Read the exact current files/symbols to edit, their direct imports/callers, tests and security/persistence boundaries.

**Stale context**

Inspect only non-context changed paths since the audited application base, then update affected context sections.

**Contradiction**

Current executable source and higher authority win. Record the discrepancy and update the context before completion.

### 4. Execute bounded work

Use:

```text
must-read files
targeted searches
conditional expansion with reasons
focused validation
affected broader validation once
```

Avoid swarms, autopilot, speculative broad audits and repeated long-prompt rereads.

### 5. Refresh before completion

Update the context base in the same PR when the task changes any of:

- canonical domain ownership;
- route/domain entry points;
- state or service authority;
- database schema, RLS, grants or RPC contracts;
- migration ledger/latest migration;
- privacy/export/deletion coverage;
- MCP tool/projection/permission architecture;
- CI, Quality, Exact Release or deploy rules;
- approved roadmap phase state;
- major active-work blocker/disposition.

Do not update it for ordinary internal refactors or visual tweaks that do not change navigation, ownership or contracts.

## Incremental refresh procedure

1. Finish and validate the implementation/source changes.
2. Record the exact implementation/source-state commit SHA.
3. Add one final context-only commit after it.
4. Set `auditedApplicationBase.sha` to the recorded implementation/source-state commit.
5. List non-context paths changed from the previous audited application base.
6. Map those paths to context sections.
7. Read only those files plus proven dependencies.
8. Update affected Markdown, overlay and JSON fields.
9. Move accepted overlay facts into canonical context only after merge.
10. Remove a closed overlay after its accepted state is represented canonically.
11. Run path/link, JSON and cross-file consistency checks.

If an implementation PR is later squash-merged, tree comparison between the recorded implementation commit and the new `main` still proves whether application content differs. Commit ancestry is not required.

## Overlay lifecycle

```text
unmerged PR
→ active-work overlay
→ corrections and current-head updates stay in overlay
→ merge accepted exact head
→ refresh canonical files from merged source
→ remove overlay
```

Never let an overlay silently overwrite canonical facts.

## Required final report

Every implementation report must include:

- exact branch/base/head;
- files changed;
- authority/architecture impact;
- database/migration impact;
- tests actually run;
- CI/artifact identity;
- context files updated or a reason no update was required;
- audited application-base SHA used by the manifest;
- remaining risk;
- no merge/deploy statement when not authorized.

## Core principle

The Knowledge Base replaces repeated **repository-wide discovery**. It does not replace exact source inspection before an edit.
