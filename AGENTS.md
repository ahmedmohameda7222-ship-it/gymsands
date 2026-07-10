# Plaivra Agent Instructions

These instructions apply to Codex and every coding agent working in this repository.

## 1. Read order

Before broad product, architecture, UX, MCP, Supabase, auth, or platform work, read:

1. `docs/product/PLAIVRA_PRODUCT_CONSTITUTION.md`
2. `docs/product/PLAIVRA_LONG_TERM_PRODUCT_AND_PLATFORM_PLAN.md`
3. `docs/product/ai-first-tracker-model.md`
4. `docs/design-system/PLAIVRA_CROSS_PLATFORM_UI_CONSTITUTION.md`
5. the relevant platform file under `docs/design-system/platforms/`
6. `docs/chatgpt-app/README.md`
7. `docs/chatgpt-app/cimd-authentication-architecture.md`
8. `docs/architecture/canonical-domain-model.md`
9. `docs/platform-roadmap/README.md`
10. task-specific code and current tests

When documents conflict, earlier items win.

Audit reports, completed prompts, old status files, and code history are evidence, not product authority.

## 2. Product model

Plaivra is a persistent, user-controlled fitness context and execution platform for ChatGPT.

- ChatGPT is the reasoning and intelligent-execution layer.
- Plaivra is the storage, context, permission, visualization, tracking, history, correction, privacy, and direct-execution layer.
- For executable requests, ChatGPT writes through authorized Plaivra tools.
- Do not build a normal copy/import queue or second in-app approval workflow.
- Preserve fast direct controls for workout logging, meal completion, hydration, tasks, habits, supplements, editing, correction, and privacy.
- Plaivra does not diagnose or prescribe.

## 3. Pre-launch change policy

Before Product Constitution Lock, broad improvements are allowed when evidence supports them.

Routes, features, navigation, UI, components, and architecture may be added, removed, merged, split, renamed, redesigned, or rebuilt.

Always preserve:

- authentication and authorization correctness;
- user ownership;
- data integrity;
- migration safety;
- privacy and consent;
- accessibility;
- rollback capability.

Do not preserve obsolete behavior merely because it already exists.

## 4. Scope discipline

For normal tasks:

- inspect the relevant domain before editing;
- use existing services and contracts where they are correct;
- do not touch unrelated files;
- do not add a new abstraction without a concrete repeated need;
- remove dead compatibility code when the task proves it is unused;
- do not create new historical status documents.

For repo-wide remediation, produce a route/domain matrix and preserve completed compliant work.

## 5. Supabase rules

- Never rewrite applied migration history.
- All DDL changes are new named migrations.
- Do not drop a table because it has zero rows.
- Prove code, route, MCP, export, deletion, and foreign-key dependencies before removal.
- Use staged convergence: add/migrate/update/verify/stop old reads/drop later.
- RLS and service-role assumptions must be explicit and tested.
- No plain-text third-party refresh/access tokens in general application tables.
- Public MCP tools must use domain services, not arbitrary table access.

Current database convergence authority: `docs/architecture/canonical-domain-model.md`.

## 6. MCP and ChatGPT app rules

- Public tools are an explicit allowlist.
- No admin tools in public member OAuth.
- No deprecated aliases in the final public catalog.
- Use task-specific context projections; do not return the complete profile by default.
- Every public tool requires strict input and output schemas.
- Validate scope, ownership, resource, token expiry, active connection, saved permissions, and revocation server-side.
- Destructive actions require explicit confirmation before execution.
- Do not report success before tool-confirmed success.
- CIMD is the target client-identification architecture.

## 7. UI rules

Use `docs/design-system/PLAIVRA_CROSS_PLATFORM_UI_CONSTITUTION.md`.

Key constraints:

- one dominant user job per route;
- one primary action per visible section;
- web mobile targets at least 44 × 44 px, preferably 48 × 48;
- iOS targets at least 44 × 44 pt;
- Android targets at least 48 × 48 dp;
- use the approved spacing, typography, radius, motion, and data-state systems;
- rendered QA must include mobile, tablet, and desktop where relevant;
- web, iOS, and Android share semantics but use platform-native behavior.

## 8. Quality requirements

Run the relevant available checks from `package.json`:

- lint;
- typecheck;
- unit/integration tests;
- production build;
- rendered browser QA for changed flows;
- security tests for auth, MCP, permissions, privacy, or data changes.

Do not claim a check passed unless it ran successfully.

## 9. Agent/Ruflo usage

Use the lightest coordination setup that can complete the task.

- small targeted change: coder + tester;
- medium multi-file change: coder + reviewer + tester;
- auth, MCP, Supabase, privacy, or security: security review + coder + reviewer + tester;
- repo-wide independent workstreams: swarm only when real parallel decomposition exists.

Do not invoke every skill by default. Coordination is not a substitute for implementation.

## 10. Final report

Report:

1. changed files;
2. product/architecture decision applied;
3. data or migration impact;
4. tests and rendered checks actually run;
5. security/privacy impact;
6. remaining risks or unverified behavior;
7. rollback or follow-up requirement.

Do not commit or push when the user explicitly prohibits it. Otherwise use clear conventional commit messages and avoid unrelated changes in the same commit.
