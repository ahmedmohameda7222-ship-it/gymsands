# Plaivra Agent Instructions

These rules apply to Codex and every coding agent working in this repository.

## Authority

For broad product or architecture work, use the authority order in `README.md`. For a scoped implementation, read only the minimum authority and direct contracts named by the approved prompt.

Historical reports, old prompts, branch handoffs, generated QA evidence, and Git history are evidence, not current authority.

## Persistent Codex context

Before any repository task, read:

1. `docs/codex-context/00_CONTEXT_MANIFEST.md`;
2. `docs/codex-context/09_CODEX_STARTUP_AND_REFRESH_PROTOCOL.md`;
3. `docs/codex-context/context_manifest.json`;
4. only the domain context files relevant to the task.

Compare the recorded canonical SHA, current `main`, current `HEAD`, migrations, and changed paths. When context is fresh, use it to avoid repository-wide rediscovery. When it is stale, inspect the diff since the recorded SHA and refresh only affected sections.

The context base is navigation and decision memory, not executable truth. Before editing, always read the exact current source, direct contracts, tests, and persistence/security boundaries involved. Active-work overlays are non-canonical until merged.

Update the affected context and manifest in the same pull request after a meaningful domain-authority, architecture, schema, RPC/RLS/grant, privacy, MCP, CI/release, or phase-state change. Ordinary internal refactors or visual tweaks do not require a context update unless entry points or contracts change.

## Execution model

Plaivra planning and implementation are separate responsibilities:

- the Planner performs broad repository analysis, approves architecture and scope, and prepares implementation-ready prompts;
- the executor implements one approved phase or correction;
- independent quality control inspects the actual branch, diff, tests, CI, database evidence, and PR state.

Use one branch, one pull request, and one completion report per phase. Do not start a later phase automatically.

## Bounded inspection

Every implementation prompt must distinguish:

1. **Must read** — exact files and contracts required before editing.
2. **Search only** — areas inspected with targeted search for references and dependencies.
3. **Conditional expansion** — additional files opened only because of imports, tests, database/security boundaries, or established conventions.
4. **Inspection record** — list each additional file and why it was needed.
5. **Do not read** — unrelated modules, old prompts, historical reports, and later phases.
6. **Validation** — run real relevant checks; never claim an unrun check passed.

Repository-wide remediation is an explicit exception and must still preserve domain boundaries and record deletion proof.

## Scope and safety

- change only the approved outcome;
- preserve authentication, authorization, ownership, data integrity, privacy, consent, accessibility, and rollback;
- remove obsolete behavior only after dependency proof;
- do not add abstractions without a concrete repeated need;
- do not commit generated screenshots, logs, manifests, or historical branch evidence to the active tree;
- never rewrite an applied Supabase migration;
- use new named migrations for DDL;
- prove route, service, MCP, export, deletion, test, RLS, grant, and foreign-key dependencies before data-model removal.

## Product model

ChatGPT is the reasoning and intelligent-execution layer. Plaivra is the persistent context, permission, storage, visualization, tracking, history, correction, privacy, and direct-execution layer.

Do not build a normal copy/import queue or second approval workflow after successful tool execution. Preserve fast direct controls for real-world execution and correction. Plaivra does not diagnose or prescribe.

## MCP and public ChatGPT

- public tools are an explicit allowlist;
- no admin tools in public member OAuth;
- use task-specific context projections;
- validate scope, ownership, resource, expiry, active connection, permissions, and revocation server-side;
- destructive actions require explicit confirmation;
- do not report success before tool-confirmed success;
- use domain services, never arbitrary client table access.

## Agents, Ruflo, and Graphify

Agents and Ruflo are off by default. Use one executor unless genuinely independent workstreams justify bounded parallelism. Do not use swarms or autopilot merely because the repository is large.

Graphify is a dependency-discovery and context-reduction aid. It never replaces source inspection, tests, SQL verification, runtime evidence, or security review. Regenerate it from clean `main` after major merged architecture phases.

## CI execution and repair

During implementation, run focused checks first and the directly affected broader suite once before pushing. Do not repeatedly run full release validation after every small edit.

For ordinary in-scope CI failures, the executor must continue autonomously:

1. inspect the failed workflow, job, step, concise relevant log tail, and focused artifact;
2. identify and reproduce the narrowest verified root cause;
3. apply the smallest correct in-scope correction;
4. run focused validation, then the directly affected suite;
5. commit and push to the same branch and pull request;
6. repeat until the required checks pass.

Do not restart the phase, perform speculative repository-wide audits, reread long prompts unnecessarily, or request a new correction prompt for routine lint, typecheck, test, fixture, build, rendered-QA, migration-replay, database-lint, or workflow-contract failures.

Stop and report an exact blocker only for missing permissions or credentials, a persistent required-service outage, unexpected Production divergence, Activity Catalog mutation, destructive or data-loss action, modification of an already-applied migration, a new unauthorized Production migration, base drift causing an architectural conflict, or a product decision outside the approved phase.

Canonical full release Quality runs once at phase closure. Exact Release consumes that run-keyed immutable artifact and must not rerun Quality.

## Completion

Report changed files, implemented decision, database/migration impact, checks actually run, security/privacy impact, remaining risk, and rollback/follow-up boundary. Do not merge, deploy, mutate production, or begin a later phase without explicit authorization.
