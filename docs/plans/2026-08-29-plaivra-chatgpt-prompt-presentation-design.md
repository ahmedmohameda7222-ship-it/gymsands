# Plaivra User-Facing ChatGPT Prompt Presentation Architecture

**Date:** 2026-08-29  
**Status:** Proposed architecture — written design awaiting explicit Planner approval before control-plane reconciliation or implementation planning  
**Scope:** Every prompt Plaivra generates, copies, opens, recommends, or pre-fills for a member to use with ChatGPT  
**Runtime impact of this document:** None

## 1. Purpose

Plaivra currently has a strong internal prompt-contract model but exposes too much of that internal orchestration to members. The shared runtime prompt builder renders machine-oriented sections such as Role, Objective, Authorized Plaivra context, Constraints, Task-specific required output, and Confirmation rule. Some custom surfaces also expose raw JSON, internal resource identifiers, MCP terminology, and tool-execution instructions.

This is technically explicit but poor product communication. The member should receive a professional prompt that expresses what they want ChatGPT to do, the useful Plaivra context, the important constraints, the desired result, and any natural approval boundary. OAuth, MCP, resource identity, schemas, permission enforcement, conflict handling, and idempotency are Plaivra execution responsibilities and belong below the user-visible prompt layer.

This design separates the human prompt presentation contract from the hidden execution contract.

## 2. Product principle

> Plaivra-generated prompts must read like a clear request from a person to a capable assistant, not like a developer prompt, API contract, database payload, or MCP instruction manual.

The member should understand the goal immediately and should not need technical knowledge of Plaivra's integration architecture.

## 3. Design inputs

The target follows current OpenAI prompting guidance in spirit:

- state the task clearly;
- include relevant context rather than all available context;
- specify constraints only when they materially affect the answer;
- state the desired result or format when useful;
- keep prompts direct and easy to edit;
- avoid repetitive instructions and unnecessary implementation detail;
- keep tool-specific execution rules in the tool/orchestration layer rather than forcing the user to repeat them.

Plaivra adds its own product requirements for authorization, persistence, explicit confirmation, tool-confirmed success, privacy, and stable resource identity. Those requirements are enforced by the hidden execution contract, not by exposing engineering language to the member.

## 4. Two-layer prompt contract

Every Plaivra-to-ChatGPT workflow uses two different contracts.

### 4.1 Layer A — User-visible prompt

This is the only text the member copies, edits, or sees as the primary ChatGPT request.

It contains, when relevant:

1. **Task** — what the member wants ChatGPT to do.
2. **Useful context** — concise human-readable Plaivra context needed for the task.
3. **Important constraints/preferences** — only details that change the result.
4. **Desired result** — what the answer should contain or optimize for.
5. **Natural approval boundary** — for generated writes, a short statement that ChatGPT should show the proposed change first and save it after the member approves.

It does not contain implementation instructions that Plaivra can enforce itself.

### 4.2 Layer B — Hidden execution contract

This is application/connector metadata and is never rendered as ordinary prompt prose.

It may include:

- prompt/capability ID;
- required OAuth scopes;
- allowed public MCP tools;
- task-specific context projection IDs;
- stable resource IDs and versions;
- current revision or `updated_at` value;
- ownership and permission requirements;
- explicit-confirmation state;
- idempotency/operation identity;
- response schema expectations;
- privacy and data-minimization rules;
- destination/source identity for Diary, Meal Plan, Saved Meal, Recipe, Workout, or other handoff;
- risk class.

The hidden contract may be strict and technical. The user-visible prompt must remain natural.

## 5. Required invariant

> User-facing prompt quality and execution safety are separate responsibilities. Removing technical language from the prompt must never weaken server-side authorization, ownership, confirmation, conflict, privacy, or idempotency controls.

The inverse is also binding:

> Internal execution rigor is not a reason to expose internal implementation language to the member.

## 6. User-visible language rules

### 6.1 Required characteristics

A Plaivra-generated prompt should normally be:

- direct;
- specific enough to avoid ambiguity;
- concise enough to scan before opening ChatGPT;
- written in the member's selected language;
- natural and professional rather than robotic;
- self-contained for the task;
- easy for the member to edit before sending;
- explicit about the desired outcome;
- explicit about the approval boundary only when a Plaivra write is intended.

### 6.2 Technical language banned from ordinary member prompts

Ordinary generated prompts must not expose the following merely to make execution work:

- `MCP`;
- OAuth scope names;
- UUIDs;
- internal resource IDs such as `food_id`, `recipe_version_id`, `plan_id`, `operationId`;
- endpoints or route paths;
- database/table names;
- RPC names;
- RLS;
- schema names;
- raw JSON payloads;
- revision tokens or `updated_at` conflict tokens;
- internal context-projection names;
- internal tool names;
- implementation phrases such as “authorized Plaivra Nutrition MCP Draft write”;
- raw permission arrays;
- internal storage authority wording.

Exception: these terms may appear when the member explicitly requests a technical/debugging/integration prompt or is using a developer-facing Plaivra surface that is intentionally documented as technical.

### 6.3 Product terminology allowed

Normal prompts may use product concepts members understand, for example:

- Plaivra;
- my meal plan;
- my food diary;
- my saved meals;
- my recipe draft;
- today's workout;
- my workout history;
- my nutrition targets;
- my food preferences;
- my progress;
- my sleep/recovery data.

The prompt should identify a selected object by human-readable information already visible to the member, while stable IDs remain hidden execution metadata.

## 7. Prompt composition model

The default English composition is conceptually:

```text
[Clear task sentence.]

[Relevant Plaivra context or preference sentence, only if useful.]

[What to optimize for / what the answer should include.]

[For a write workflow only: show the proposed change first; after I approve it, save/update it in Plaivra.]
```

This is a composition model, not a mandatory paragraph count. Short tasks should remain short.

The system must not force every prompt into repetitive headings such as Role/Objective/Constraints/Output/Confirmation.

## 8. Read vs write presentation

### 8.1 Read prompts

Read prompts should ask for analysis, explanation, planning, comparison, or recommendation using only relevant authorized Plaivra context.

They should not contain phrases such as:

- “Do not change Plaivra data” unless the task could reasonably be mistaken for a write and clarification materially helps;
- “use only authorized context”;
- “do not expose internal records”;
- “call tool X.”

Those are execution-layer policies.

### 8.2 Write prompts

Write prompts use a natural two-step experience:

1. ChatGPT proposes the complete user-meaningful change.
2. The member explicitly approves.
3. ChatGPT executes the public Plaivra tool.
4. Success is stated only after tool-confirmed success.

The visible prompt needs only concise wording such as:

> Show me the revised plan first. If I approve it, update it in Plaivra.

The prompt does not need to explain `confirm:true`, tool names, scopes, operation IDs, or conflict tokens.

### 8.3 Direct explicit writes

If the member themselves directly asks ChatGPT to log a fact or perform a simple low-risk action, the connector may execute according to the public MCP risk/confirmation policy without forcing the long proposal template when the product contract permits direct execution.

The prompt system must not create a redundant second approval workflow after a successful tool execution.

## 9. Context presentation

### 9.1 Minimum necessary context

Plaivra should include only context that materially affects the task.

Examples:

- a meal replacement may need the selected meal, nutrition targets, allergies/food limitations, and relevant preferences;
- a workout adjustment may need today's workout, available time/equipment, goals, and current member-authored constraints;
- a weekly review may need bounded workout/nutrition/hydration/recovery summaries.

A prompt should not dump every profile field because access was granted.

### 9.2 Human-readable context

User-visible context is rendered in natural language or compact readable facts, not raw objects.

Poor:

```json
{"food_id":"...","quantity":1,"source_version_id":"..."}
```

Preferred:

> Current meal: Oats with Skyr, banana and peanut butter.

Stable identities remain hidden.

### 9.3 Missing context

When required context is missing, the prompt should say what useful information is missing in member language or let ChatGPT ask for it when needed. It must not invent values or expose a technical “projection unavailable” message.

## 10. Multilingual contract

Plaivra prompt intent must be equivalent across English, German, and Arabic.

Rules:

- translations should sound native rather than literal engineering translations;
- the same task, approval boundary, and important constraints must survive localization;
- Arabic prompts must preserve RTL-safe presentation and must not leak untranslated internal English field names;
- user-provided names and food/exercise/recipe titles remain as authored unless an explicit translation is part of the task;
- locale may affect units/presentation, not the underlying execution identity.

## 11. Prompt families requiring migration

The migration applies to the full runtime prompt catalog and every custom/generated ChatGPT handoff, not a sample subset.

Current quick-prompt families include:

- Nutrition;
- Training;
- Progress;
- Daily guidance;
- Profile review;
- Grocery;
- Recovery/wellness.

Recipe external prompts are a separate custom surface and are explicitly included.

Any future Plaivra surface that generates text for external ChatGPT automatically inherits this architecture.

## 12. Representative target prompts

These examples establish style and semantic expectations. They are not the implementation inventory by themselves.

### 12.1 Recipe Working Draft

Target style:

> Help me create this recipe in Plaivra using the details I've already entered. Complete the ingredients, servings, cooking time, and clear step-by-step instructions. Keep nutrition values tied to Plaivra's food data rather than estimating them as saved facts. Show me the finished working draft first. If I approve it, save the draft to Plaivra.

The user-visible prompt must not include raw draft JSON, `food_id`, tool names, or MCP terminology.

### 12.2 Replace a planned meal

Target style:

> Replace this meal with an option that serves the same purpose in my meal plan. Use my Plaivra nutrition targets and relevant food preferences, and keep the replacement practical for this day. Show me the replacement and briefly compare it with the original. If I approve it, update my meal plan in Plaivra.

### 12.3 Adjust today's workout

Target style:

> Adjust today's workout so it fits the time and equipment I have available. Use my current Plaivra workout and training goals, keep the main purpose of the session intact, and make the smallest practical changes. Show me the revised workout and briefly explain what changed. If I approve it, save the update to Plaivra.

This prompt must not be exposed as executable until a real public Train write MCP contract exists.

### 12.4 Weekly review

Target style:

> Review my past week in Plaivra using the workout, nutrition, hydration, and recovery data that is available. Tell me what went well, where I was inconsistent, and the 2–3 practical changes likely to help most next week.

### 12.5 Grocery list

Target style:

> Build a practical grocery list from my current Plaivra meal plan for this week. Combine repeated ingredients, use useful shopping quantities where the saved meal information supports them, and group the list by store section.

This is a derived/read workflow. The prompt must not promise to create a second saved grocery-list authority.

### 12.6 Food correction

Target style:

> The nutrition information I use for this food is different from Plaivra's current value. Help me review the correction I want to use for my account. Show me exactly what would change first. If I approve it, save the correction for me without changing the shared Plaivra food catalog.

## 13. Prompt catalog architecture changes required during implementation

The current prompt runtime treats a prompt as supported when its declared backing capability is either a public MCP tool or an internal AI action. That rule is invalid for external ChatGPT execution.

The target model distinguishes execution channels explicitly, for example conceptually:

```text
capability channel:
- external_chatgpt_public_mcp
- plaivra_internal_action
- read_only_reasoning
```

For external ChatGPT:

- a read prompt must have a valid public read path when Plaivra promises connected-data access;
- a write prompt must have a valid public write MCP path;
- an internal action alone cannot make an external write prompt runtime-exposed;
- unsupported write prompts are hidden, disabled with an honest product state, or reclassified as read-only suggestion prompts until the public write capability exists.

Exact type names are implementation details; the semantic distinction is binding.

## 14. Prompt metadata and execution metadata

Prompt definitions should keep human-facing copy separate from machine-facing execution metadata.

Conceptually:

```text
PromptDefinition
├── presentation
│   ├── title
│   ├── description
│   ├── task copy by locale
│   ├── optional human context formatter
│   └── optional natural approval sentence
└── execution
    ├── channel
    ├── required capability IDs
    ├── required permission sections/scopes
    ├── context projection IDs
    ├── risk/confirmation policy
    └── resource binding rules
```

The implementation must not rebuild hidden execution safety by concatenating technical instructions into the visible prompt.

## 15. User editing and prompt preview

The member may edit the visible prompt before opening/sending it.

Editing visible wording must not grant additional Plaivra permissions or bypass hidden scope checks. Connector authority always comes from the active OAuth connection and server-side permission state, not from text the member or ChatGPT writes in the conversation.

If a member removes the natural approval sentence but the underlying tool requires confirmation, the server-side confirmation rule still applies.

## 16. Safety and trust rules

User-facing prompts must not imply capabilities Plaivra does not have.

Examples:

- do not promise that a Recipe draft will be saved while the Recipe Draft public MCP is missing;
- do not promise that a workout will be adjusted when only an internal action exists;
- do not say a grocery list will be saved when Shopping is derived from Meal Plan;
- do not imply medical diagnosis/prescription authority;
- do not imply that ChatGPT nutrient estimates become Plaivra nutrition truth;
- do not imply success until the tool confirms it.

Where a public capability is temporarily unavailable, the prompt may ask ChatGPT to propose a result without claiming that Plaivra will persist it.

## 17. Automated quality gates

Implementation must add tests that operate on the complete generated prompt catalog and custom handoff builders.

Required coverage:

1. every runtime prompt has a presentation contract;
2. every runtime external write prompt maps to a real public write capability;
3. internal action alone cannot satisfy external write support;
4. EN/DE/AR snapshots preserve the same intent and write/read classification;
5. ordinary user-visible prompts contain none of the banned technical tokens/structures except explicit technical surfaces;
6. raw JSON objects and stable IDs are not rendered into ordinary prompt text;
7. prompts do not expose OAuth scope names, MCP tool names, endpoints, tables, RPC names, RLS, or operation IDs;
8. Recipe prompts contain no `food_id`/raw draft JSON and preserve the Working Draft/no-publish rule in human language;
9. Grocery prompts do not create a second saved Shopping authority;
10. prompts never promise execution for missing public MCP capabilities;
11. generated prompts remain editable and readable in all three supported locales;
12. permission denial/missing-scope states are communicated in product language outside the prompt rather than by dumping technical permission details into the prompt.

A narrow banned-token allowlist exception may exist for explicitly developer-facing prompts only and must be opt-in, not default.

## 18. QA review standard

Prompt QA is not complete by unit snapshots alone.

The implementation phase must review representative rendered prompts for:

- clarity in the first sentence;
- useful context without over-sharing;
- no implementation jargon;
- accurate read/write promise;
- natural confirmation wording;
- no duplicate instructions;
- no conflicting directives;
- editability;
- English, German, and Arabic quality;
- mobile and desktop prompt-preview readability where the surface is rendered;
- correct RTL behavior for Arabic.

## 19. Rollout order

After this design and the Public MCP Surface Completeness Architecture are approved:

1. separate external public capability validation from internal AI actions;
2. implement the new presentation/execution metadata split in the shared prompt runtime;
3. rewrite all catalog prompt presentation copy using the new composition model;
4. migrate Recipe external prompt builders and any other handwritten/custom prompt surfaces;
5. add complete catalog/custom-surface regression tests;
6. expose write prompts only as their public MCP capabilities become real;
7. perform EN/DE/AR rendered QA and copy review.

The implementation plan must preserve one scope/branch/PR per approved implementation phase rather than mixing every MCP addition and all prompt rewrites into one unsafe mega-change.

## 20. Acceptance criteria for this architecture

This architecture is ready for implementation planning only when:

- the Planner explicitly approves this written design;
- the Public MCP Surface Completeness Architecture is approved alongside it;
- the product accepts the separation between visible prompt copy and hidden execution contract;
- the banned technical-language policy is accepted;
- the external-vs-internal capability distinction is accepted;
- canonical control-plane documents are reconciled in the documentation PR before runtime implementation begins.
