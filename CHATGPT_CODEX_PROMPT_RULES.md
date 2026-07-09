# ChatGPT Codex Prompt Rules for Plaivra

Use this file in future ChatGPT conversations.

## Main Rule

## Plaivra Taste Skill Rule

When a Codex task involves public landing/auth visual polish, marketing/product UI cards, mobile mockup references, or anti-generic layout review, include the relevant Taste Skill.

Use Taste Skill only as a secondary visual-quality layer.

Plaivra source-of-truth files override Taste Skill:

- `docs/product/ai-first-tracker-model.md`
- `docs/ux-constitution/README.md`
- `docs/ux-constitution/flow-and-workflow-audit.md`
- `docs/ux-constitution/motion-and-interaction.md`
- `docs/ux-progress/README.md`

Required instruction to include in those Codex prompts:

```text
Plaivra UX Constitution overrides Taste Skill. Use Taste only for landing/auth visual polish, product UI cards, mobile mockup references, and anti-generic layout review.

ChatGPT should choose the exact Codex mode and Ruflo skills for each task before writing the Codex prompt.

Do not rely on Codex to guess the skill list by itself.

## Future User Message

Use this in a new chat:

```text
Read CHATGPT_CODEX_PROMPT_RULES.md and Ruflo_usage.md from my repo.
I want to do this task:
[describe task]

Choose the best Codex mode and Ruflo skills.
Then write the exact prompt I should paste into Codex.
Optimize for low token usage and launch-quality output.
```

## What ChatGPT Must Output

For each task, ChatGPT must provide:

1. Recommended Codex mode.
2. Exact skill list.
3. Whether to start with `/caveman lite`.
4. The final Codex prompt.
5. What Codex should avoid changing.
6. Verification steps.

## Default Choice Table

| Task | Setup |
|---|---|
| Tiny edit | medium |
| Normal fix | high |
| Non-risky work with token saving | medium plus advisor |
| Important app change | high plus advisor |
| Whole UX audit | medium mapping plus advisor |
| Very hard bug | xhigh or high plus advisor |

## Skill Sets

Normal fix:

```text
/caveman lite

$memory-management $agent-coder $agent-reviewer $agent-tester
```

Big UX or multi-file flow:

```text
/caveman lite

$swarm-orchestration $memory-management $agent-reviewer $agent-tester
```

App data, API, login, or write-flow task:

```text
/caveman lite

$memory-management $security-audit $agent-reviewer $agent-coder $agent-tester
```

Audit only:

```text
/caveman lite

$swarm-orchestration $memory-management $performance-analysis $agent-reviewer
```

## Standard Prompt Shape

```text
/caveman lite

[skills]

Task:
[exact task]

Mode:
[recommended mode]

Before editing:
1. Use memory_search before planning.
2. Inspect only relevant files.
3. Make a short plan.

Rules:
1. Make the smallest clean change.
2. Do not touch unrelated files.
3. Preserve existing behavior.
4. Run available checks.

Final report:
1. Changed files
2. What changed
3. What was tested
4. Risks
5. Anything not verified
6. Whether memory_store was used
```

## Final Workflow

1. Ask ChatGPT for the task.
2. ChatGPT reads this file and `Ruflo_usage.md`.
3. ChatGPT chooses explicit skills.
4. ChatGPT writes one exact Codex prompt.
5. User pastes the prompt into Codex.
