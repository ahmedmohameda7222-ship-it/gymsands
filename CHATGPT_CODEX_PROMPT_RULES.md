# ChatGPT and Codex Prompt Rules for Plaivra

Use this file when preparing a Codex task for Plaivra.

## 1. Product authority

Every prompt must respect this read order:

1. `docs/product/PLAIVRA_PRODUCT_CONSTITUTION.md`
2. `docs/product/PLAIVRA_LONG_TERM_PRODUCT_AND_PLATFORM_PLAN.md`
3. `docs/product/ai-first-tracker-model.md`
4. `docs/design-system/PLAIVRA_CROSS_PLATFORM_UI_CONSTITUTION.md`
5. relevant platform file under `docs/design-system/platforms/`
6. `docs/chatgpt-app/README.md`
7. `docs/chatgpt-app/cimd-authentication-architecture.md`
8. `docs/architecture/canonical-domain-model.md`
9. `docs/platform-roadmap/README.md`
10. task-specific implementation and tests

Do not use removed audits, progress trackers, submission evidence, or historical prompts as current authority.

## 2. Required product instruction

Include this for product, UX, MCP, or data work:

```text
Plaivra is a persistent, user-controlled fitness context and execution platform for ChatGPT. ChatGPT is the reasoning layer and directly creates or updates structured Plaivra data through authorized tools. Plaivra is the storage, visualization, tracking, history, correction, permission, privacy, and execution layer. Do not build a copy/import queue or a second in-app approval workflow. Preserve fast direct controls for daily real-world execution and correction.
```

## 3. Choose scope before model intensity

Do not send the whole repository to the heaviest model for every task.

Recommended pattern:

| Task | Default approach |
|---|---|
| Tiny mechanical edit | fast/economical model, medium reasoning |
| Route or normal bug | everyday coding model, high reasoning |
| Multi-file feature in one domain | everyday or strongest coding model, high reasoning |
| Architecture, MCP, auth, privacy, security | strongest coding model, extra-high reasoning |
| One unusually hard isolated problem | strongest coding model, maximum single-problem reasoning when necessary |
| Multiple genuinely independent workstreams | parallel/ultra only when usage budget supports it |

Large repository size alone does not justify maximum or parallel reasoning. Relevant scope and task coupling decide.

For usage-constrained plans, prefer focused vertical tasks and reuse existing repository maps.

## 4. Skill selection

Use only relevant skills.

### Normal change

```text
$memory-management
$agent-coder
$agent-reviewer
$agent-tester
```

### Auth, MCP, Supabase, privacy, or user data

```text
$memory-management
$security-audit
$agent-coder
$agent-reviewer
$agent-tester
```

### Repo-wide work with independent domains

```text
$swarm-orchestration
$memory-management
$security-audit
$performance-analysis
$agent-coder
$agent-reviewer
$agent-tester
```

Do not invoke swarm for a single route or one tightly coupled problem.

## 5. Standard prompt structure

```text
/caveman lite

[only the relevant skills]

Task:
[one exact outcome]

Authoritative references:
[list only the required constitution/architecture files]

Current product rule:
[include the Plaivra product instruction]

Scope:
[domains/routes/files to inspect]

Before editing:
1. Inspect current git status and preserve compliant unfinished work.
2. Read the authoritative references.
3. Inspect relevant code, tests, schemas, and runtime dependencies.
4. Produce a short implementation plan.

Rules:
1. Complete the task; do not stop at an audit or plan.
2. Change only what is needed for the outcome.
3. Remove obsolete behavior when the task proves it is no longer used.
4. Do not preserve a contradictory historical workflow.
5. Never rewrite applied Supabase migrations.
6. Preserve authentication, authorization, ownership, data integrity, privacy, accessibility, and rollback.
7. Run available checks and rendered QA relevant to the change.
8. Do not claim unrun checks passed.

Final report:
1. Changed files.
2. Product/architecture decision implemented.
3. Database or migration impact.
4. Tests and rendered checks actually run.
5. Security/privacy impact.
6. Remaining risks and anything not verified.
7. Rollback/follow-up requirement.
```

## 6. Long-running task goal

For a long-running Codex CLI task, set a concise `/goal` that points to the immediately preceding detailed prompt. Do not paste an oversized prompt into `/goal`.

Example:

```text
/goal Treat my immediately previous detailed Plaivra prompt as the authoritative task. Continue from the current working-tree state, preserve compliant completed work, finish implementation and verification, and do not commit or push unless explicitly requested.
```

Use `/goal resume` only when the CLI reports that the goal is paused.

## 7. Taste and external design references

External visual references are secondary.

The Plaivra Product Constitution and Cross-Platform UI Constitution override Taste Skill, screenshots, generic app patterns, and generated design suggestions.

Use external references to improve polish, not to change the product model or create inconsistent platform behavior.

## 8. Future user message

```text
Read AGENTS.md, CHATGPT_CODEX_PROMPT_RULES.md, and the authoritative Plaivra documents required for this task.

Task:
[describe the exact outcome]

Choose the most economical model/reasoning and only the Ruflo skills needed. Then write one exact Codex prompt that completes the implementation and verification without unrelated changes.
```
