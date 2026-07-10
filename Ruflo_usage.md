# Ruflo Usage Reference for Plaivra

Use Ruflo only when it adds real coordination value. Plaivra product and architecture documents remain authoritative.

## 1. Read first

- `AGENTS.md`
- `docs/product/PLAIVRA_PRODUCT_CONSTITUTION.md`
- `docs/product/PLAIVRA_LONG_TERM_PRODUCT_AND_PLATFORM_PLAN.md`
- the task-specific architecture/design document

## 2. Core rule

Use the lightest effective workflow.

| Task | Recommended skills |
|---|---|
| Small code/UI fix | `$memory-management $agent-coder $agent-tester` |
| Medium multi-file change | `$memory-management $agent-coder $agent-reviewer $agent-tester` |
| Supabase/auth/API/MCP/privacy | `$memory-management $security-audit $agent-coder $agent-reviewer $agent-tester` |
| Repo-wide independent domains | `$swarm-orchestration $memory-management $security-audit $performance-analysis $agent-coder $agent-reviewer $agent-tester` |
| Audit only | `$memory-management $security-audit $performance-analysis $agent-reviewer` |

Do not invoke swarm merely because a repository is large. Use it when work can be split into independent domains without agents editing the same files repeatedly.

## 3. Normal implementation prompt

```text
/caveman lite

$memory-management
$agent-coder
$agent-reviewer
$agent-tester

Task:
[one exact outcome]

Authoritative references:
[list the required Plaivra constitution/architecture files]

Before editing:
1. Inspect git status and current unfinished work.
2. Read the authoritative references.
3. Inspect only relevant code, tests, and dependencies.
4. Make a short plan.

Rules:
1. Complete implementation; do not stop at a plan.
2. Do not touch unrelated files.
3. Remove obsolete behavior only when dependencies are proven.
4. Preserve auth, ownership, data integrity, privacy, accessibility, and rollback.
5. Run the relevant available checks.
6. Report only checks actually run.
```

## 4. Supabase, auth, MCP, and privacy prompt

```text
/caveman lite

$memory-management
$security-audit
$agent-coder
$agent-reviewer
$agent-tester

Task:
[exact security/data outcome]

Read:
- AGENTS.md
- docs/product/PLAIVRA_PRODUCT_CONSTITUTION.md
- docs/chatgpt-app/README.md
- docs/chatgpt-app/cimd-authentication-architecture.md
- docs/architecture/canonical-domain-model.md

Requirements:
1. Map application, route, MCP, export, deletion, test, and database dependencies.
2. Never rewrite applied migrations.
3. Use a new migration for DDL.
4. Validate user ownership and least privilege.
5. Add positive and negative authorization tests.
6. Provide rollback and production validation steps.
7. Do not weaken RLS or expose service-role behavior to clients.
```

## 5. Cross-platform UI prompt

```text
/caveman lite

$memory-management
$agent-coder
$agent-reviewer
$agent-tester

Task:
[exact screen or flow]

Read:
- docs/product/PLAIVRA_PRODUCT_CONSTITUTION.md
- docs/design-system/PLAIVRA_CROSS_PLATFORM_UI_CONSTITUTION.md
- the relevant platform file under docs/design-system/platforms/

Requirements:
1. Preserve one dominant job and one primary action.
2. Use approved touch, spacing, typography, radius, motion, and state rules.
3. Implement loading, empty, error, retry, pending, success, and permission states where relevant.
4. Run rendered QA at the required viewport/platform matrix.
5. Check keyboard/screen-reader/reduced-motion behavior.
```

## 6. Repo-wide remediation

Use a swarm only when work can be divided into domains such as:

- product/documentation;
- ChatGPT/MCP/CIMD;
- design system;
- workouts;
- nutrition;
- privacy/security;
- performance/testing.

The lead agent must prevent contradictory edits and preserve one source of truth.

## 7. Memory

Use memory for reusable implementation facts, not obsolete product decisions. Never let saved memory override the Product Constitution or current repository evidence.

## 8. Completion report

Every task reports:

- changed files;
- implemented decision;
- tests and rendered checks actually run;
- database/migration impact;
- security/privacy impact;
- remaining risk;
- rollback or required next step.
