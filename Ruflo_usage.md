# Ruflo Usage Reference for Plaivra

This file is a working reference for using Ruflo / Claude Flow with OpenAI Codex in this repository.

Use it when asking ChatGPT or Codex for new ideas, audits, fixes, or implementation prompts. The goal is to make future prompts consistent with the repo's workflow: inspect first, plan briefly, make minimal changes, test, report risks, and store successful patterns.

---

## Current Repo Context

Repository: `gymsands`

Product name in code: `plaivra`

Stack:

- Next.js
- React
- TypeScript
- Supabase
- Tailwind
- Vitest
- MCP / ChatGPT request flows
- Mobile-first app experience

Important app areas:

- `app/` — routes, private app pages, API routes, OAuth, MCP endpoints
- `components/` — UI and domain components for workouts, meals, progress, wellness, auth, admin
- `lib/` — auth, MCP, Supabase, privacy, security, server helpers
- `services/` — workouts, meals, nutrition, progress, reports, wellness
- `types/` — shared TypeScript/database types
- `supabase/` — migrations, archive, seeds
- `.agents/` — Ruflo / Codex skills
- `.claude-flow/` — Ruflo / Claude Flow local coordination state

---

## Core Principle

Do not use the heaviest Ruflo flow for every task.

Best results come from matching the prompt to the task size:

| Task Type | Best Skill Set |
|---|---|
| Small UI/code fix | `$memory-management $agent-coder $agent-tester` |
| Medium feature touching 2–3 files | `$memory-management $agent-coder $agent-reviewer $agent-tester` |
| Big flow/refactor touching 3+ areas | `$swarm-orchestration $memory-management $agent-reviewer $agent-tester` |
| Supabase/auth/user data/API/MCP | `$memory-management $security-audit $agent-reviewer $agent-coder $agent-tester` |
| Pre-launch audit only | `$swarm-orchestration $memory-management $security-audit $performance-analysis $agent-reviewer` |

Permanent rule:

```text
Always use memory.
Use task-specific agents.
Use swarm only for complex multi-file work.
Use security/reviewer for risky data flows.
Force Codex to inspect, plan, edit minimally, test, report, and store the successful pattern.
```

---

## Default Prompt for Most Fixes

Use this for normal Plaivra bug fixes or small feature changes.

```text
$memory-management $agent-coder $agent-reviewer $agent-tester

Task:
[write the exact bug or feature]

Execution rules:
1. First inspect only the relevant files.
2. Use memory_search before planning.
3. Make a short plan before editing.
4. Make the smallest clean change.
5. Do not touch unrelated UI, routes, env files, database schema, or styling.
6. Preserve existing behavior unless I explicitly ask to change it.
7. Run the normal checks from package.json.
8. Report:
   - changed files
   - what changed
   - what was tested
   - risks
   - anything not verified
9. If the fix works, store the successful implementation pattern with memory_store.
```

---

## Prompt for Big Flow or Refactor Work

Use this for workout flow, mobile animations, ChatGPT request flow, Supabase + UI changes, or anything touching 3+ files.

```text
$swarm-orchestration $memory-management $agent-reviewer $agent-tester

Task:
[write the exact feature or bug]

Use a small hierarchical swarm:
- researcher: inspect only the relevant files
- architect: decide the cleanest minimal structure
- coder: implement the smallest clean change
- tester: run available checks
- reviewer: check regressions and unrelated changes

Rules:
1. Use memory_search before planning.
2. Do not rewrite whole files unless required.
3. Do not touch unrelated UI, routes, env files, or database schema.
4. Preserve existing behavior.
5. Keep the implementation clean and production-safe.
6. Report changed files, tests, risks, and anything not verified.
7. If successful, store the pattern with memory_store.
```

---

## Prompt for Supabase, Auth, API, MCP, or User Data

Use this for risky areas like OAuth, account deletion, export data, ChatGPT request buttons, meal imports, workout replacements, grocery lists, and any user data flow.

```text
$memory-management $security-audit $agent-reviewer $agent-coder $agent-tester

Task:
[write the exact data/API/auth/security task]

Rules:
1. Inspect related API routes, service files, types, and Supabase usage before editing.
2. Use memory_search before planning.
3. Check user ownership, auth boundaries, and data leakage risk.
4. Do not weaken RLS/security assumptions.
5. Do not change schema unless absolutely required.
6. Make the smallest clean change.
7. Run typecheck/build/tests if available.
8. Report security risks and anything not verified.
9. Store the successful pattern with memory_store.
```

---

## Prompt for Mobile UX / Premium Feel Audit

Use this when no edits are wanted and the goal is to generate ideas or find weak flows.

```text
$swarm-orchestration $memory-management $security-audit $performance-analysis $agent-reviewer

Task:
Run a strict pre-launch audit for Plaivra mobile.

Do not edit files.

Scope:
- mobile UX
- workout flow
- meal flow
- ChatGPT request buttons
- settings/privacy/export/delete
- auth
- Supabase/user data safety
- performance
- premium app feel

Output:
1. Critical bugs
2. UX friction
3. Mobile polish issues
4. Security/data risks
5. Performance risks
6. Missing tests
7. Prioritized fix list
8. Exact next Codex prompt to fix the highest-impact issue
```

---

## Prompt for New Ideas Before Coding

Use this with ChatGPT first when brainstorming features, UX improvements, or app direction.

```text
Act as a strict senior mobile product designer and technical product auditor for Plaivra.

Use the repo context from Ruflo_usage.md as the operating standard.

Goal:
Give me new ideas for [section/flow], but separate them into:
1. High-impact ideas
2. Low-risk quick wins
3. Risky ideas that need validation
4. Ideas that should not be built yet

Constraints:
- Mobile-first.
- Premium app feeling, not only premium UI.
- Avoid adding complexity without clear user value.
- Respect existing Plaivra flows: workouts, meals, progress, wellness, ChatGPT request flows, Supabase user data.
- End with the best Codex/Ruflo prompt to implement only the top recommended idea.
```

---

## Prompt for Turning Ideas into a Clean Codex Task

Use this after ChatGPT gives ideas and you want a precise implementation prompt.

```text
Based on the chosen idea, write the exact Codex prompt I should use with Ruflo.

Requirements:
1. Pick the right Ruflo skill set.
2. Define the exact task.
3. Define files/areas Codex should inspect first.
4. Add strict rules to avoid unrelated changes.
5. Add verification steps.
6. Add final report requirements.
7. Include memory_store only if the implementation works.
```

---

## Prompt for Existing Bug Fixes

Use this when something is visually or functionally broken.

```text
$memory-management $agent-coder $agent-reviewer $agent-tester

Task:
Fix this bug: [describe bug exactly].

Observed behavior:
[what happens now]

Expected behavior:
[what should happen]

Rules:
1. Reproduce/trace the issue from relevant files before editing.
2. Use memory_search before planning.
3. Identify the root cause.
4. Make the smallest clean fix.
5. Do not refactor unrelated code.
6. Do not change unrelated UI.
7. Run the normal checks.
8. Report root cause, changed files, tests, risks, and anything not verified.
9. Store the successful pattern with memory_store if the fix works.
```

---

## Prompt for Workout Session Flow Work

Use this for the workout session page, start workout button, animated session panel, nav hiding, timer, set progress, and mobile session behavior.

```text
$swarm-orchestration $memory-management $agent-reviewer $agent-tester

Task:
Improve/fix the workout session flow: [describe exact change].

Use a small hierarchical swarm:
- researcher: inspect current workout session components and state flow only
- architect: decide the cleanest minimal structure
- coder: implement only the necessary changes
- tester: verify mobile behavior and available checks
- reviewer: check regressions and unrelated edits

Rules:
1. Mobile-first.
2. Do not touch unrelated workout plan logic.
3. Do not change data models unless required.
4. Do not recreate old workout session pages.
5. Remove unused code if it becomes obsolete.
6. Preserve existing workout completion and set-tracking behavior.
7. Report changed files, tests, risks, and anything not verified.
8. Store the successful pattern with memory_store if the fix works.
```

---

## Prompt for ChatGPT Request Button Flows

Use this for Plaivra buttons that ask ChatGPT to replace meals, replace exercises, rebalance workouts, adjust calories, or push approved changes.

```text
$memory-management $security-audit $agent-reviewer $agent-coder $agent-tester

Task:
Audit/fix this ChatGPT request flow: [describe the exact button/flow].

Rules:
1. Inspect the UI button, API route, prompt construction, service layer, and Supabase update path.
2. Use memory_search before planning.
3. Confirm whether the flow only suggests changes or actually writes to Plaivra.
4. Do not allow silent destructive updates.
5. Preserve the approval step unless I explicitly ask to write changes.
6. Check auth/user ownership assumptions.
7. Make the smallest clean fix.
8. Run checks.
9. Report changed files, data-safety risks, tests, and anything not verified.
10. Store the successful pattern with memory_store if the fix works.
```

---

## Prompt for Settings, Privacy, Export, and Account Deletion

Use this for settings cleanup, CSV/JSON export, account deletion, privacy flows, and Vercel/Supabase-related behavior.

```text
$memory-management $security-audit $agent-reviewer $agent-coder $agent-tester

Task:
Fix/improve this settings/privacy flow: [describe exact change].

Rules:
1. Inspect settings UI, related API routes, services, Supabase calls, and types.
2. Use memory_search before planning.
3. Verify user ownership and auth checks.
4. Do not expose sensitive user data.
5. Do not weaken deletion/export safety.
6. Make output user-readable when relevant, such as CSV for normal users.
7. Make the smallest clean change.
8. Run checks.
9. Report changed files, security risks, tests, and anything not verified.
10. Store the successful pattern with memory_store if the fix works.
```

---

## Prompt for Performance

Use this when a page feels slow or heavy.

```text
$memory-management $performance-analysis $agent-reviewer $agent-coder $agent-tester

Task:
Investigate and improve performance for [page/flow].

Rules:
1. Inspect rendering, data fetching, expensive components, and repeated Supabase/API calls.
2. Use memory_search before planning.
3. Identify the likely bottleneck before editing.
4. Make the smallest safe optimization.
5. Avoid premature rewrites.
6. Run checks.
7. Report measured/observed issue, changed files, tests, risks, and anything not verified.
8. Store the successful pattern with memory_store if the fix works.
```

---

## Prompt for Security Review

Use this before launch or before changing auth/data/MCP code.

```text
$memory-management $security-audit $agent-reviewer

Task:
Run a strict security review for [area].

Do not edit files unless I explicitly approve.

Check:
1. Auth boundary
2. User ownership checks
3. Supabase query safety
4. Data leakage
5. MCP endpoint exposure
6. OAuth callback risks
7. Dangerous write operations
8. Missing validation

Output:
1. Critical risks
2. Medium risks
3. Low risks
4. False positives / probably safe areas
5. Exact Codex prompt for the highest-priority fix
```

---

## After Every Successful Fix

Ask Codex to report this:

```text
Final report:
1. Changed files
2. What changed
3. What was tested
4. Risks
5. Anything not verified
6. Whether memory_store was used
7. Recommended next step
```

---

## Do Not Do This

Avoid these patterns:

```text
Use the whole swarm for every tiny edit.
Rewrite the whole page.
Fix everything at once.
Touch unrelated files.
Change database schema without asking.
Change env/Vercel settings unless the task is specifically about env/Vercel.
Skip tests.
Commit without reviewing git diff.
Use vague prompts like: make it better.
```

---

## Local Commands

Open the repo:

```cmd
cd "C:\Users\Ahmee\Documents\Codex\2026-06-29\you-are-a-senior-next-js-2\work\gymsands"
codex
```

Check Ruflo MCP:

```cmd
codex mcp list
```

Expected MCP entry:

```text
claude-flow  npx  claude-flow@alpha mcp start  enabled
```

Check Git before and after Codex work:

```cmd
git status
git diff --stat
```

Never blindly run:

```cmd
git add .
```

Prefer targeted add:

```cmd
git add path/to/changed-file
```

---

## Best Operating Workflow

1. Ask ChatGPT for ideas using this file as reference.
2. Ask ChatGPT to convert the chosen idea into a precise Ruflo/Codex prompt.
3. Run Codex from the repo root.
4. Paste the prompt with explicit `$skill-name` usage.
5. Review the final report.
6. Check `git diff`.
7. Test locally.
8. Commit only the intended files.
9. Push.

---

## Standard Request to ChatGPT

When starting a new improvement discussion, use this:

```text
Use the repo's Ruflo_usage.md as the operating reference.
I want new ideas for [area].
Give me practical recommendations, then write the exact Ruflo/Codex prompt for the best one.
Do not suggest broad rewrites unless clearly necessary.
```
