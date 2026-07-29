# Codex Startup and Refresh Protocol

> Generated: `2026-07-29T15:37:00+02:00`  
> Repository: `ahmedmohameda7222-ship-it/gymsands`  
> Canonical base: `main@2169527efc3c2cd4210fc358a58c6bce37f1788b`  
> Active-work overlay: `PR #90@e4cfca2f909912fa3041cebaf5689944dc655339`  
> Freshness: verify the manifest and Git diff before relying on this snapshot. Exact source, migrations, tests, and workflows remain executable truth.

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
main SHA
base SHA
changed files
latest repository migration
active PR/head when relevant
```

Compare with the manifest.

### 3. Choose one path

**Fresh context, unrelated unchanged domain**

Use the context index. Do not rediscover the whole repository.

**Fresh context, editing a known domain**

Read the exact current files/symbols to edit, their direct imports/callers, tests and security/persistence boundaries.

**Stale context**

Inspect the diff from the recorded SHA to current state, then update only affected context sections.

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

1. Set previous manifest SHA as the comparison base.
2. List changed paths and commits.
3. Map changed paths to context sections.
4. Read only those files plus proven dependencies.
5. Update affected Markdown and JSON fields.
6. Move accepted overlay facts into canonical context only after merge.
7. Remove a closed overlay after its accepted state is represented canonically.
8. Set the new canonical SHA and generated timestamp.
9. Run path/link and consistency checks.

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
- remaining risk;
- no merge/deploy statement when not authorized.

## Core principle

The Knowledge Base replaces repeated **repository-wide discovery**. It does not replace exact source inspection before an edit.
