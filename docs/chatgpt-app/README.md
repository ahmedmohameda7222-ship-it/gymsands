# Plaivra ChatGPT App

**Version:** 2026.2  
**Status:** ChatGPT app source of truth

## 1. Purpose

Plaivra connects a user's persistent fitness context and structured tracking account to ChatGPT.

The integration lets ChatGPT:

- retrieve only task-relevant authorized context;
- avoid asking the user to repeat known profile information;
- create or update structured Plaivra records through authorized tools;
- explain progress using user-owned data.

Plaivra remains the durable storage, visualization, execution, correction, history, privacy, and permission layer.

## 2. User experience

```text
User selects Plaivra in ChatGPT
→ Connect
→ Plaivra login
→ explicit permission consent
→ return to ChatGPT
→ ask for an advisory or executable task
→ ChatGPT reads minimum context
→ ChatGPT calls Plaivra tools when needed
→ Plaivra stores and displays confirmed results
```

The final public flow must not require copied tokens, copied connection UUIDs, or manual client-ID configuration.

## 3. Public v1 boundaries

Public v1 should be a curated MCP app. Custom ChatGPT UI may be added selectively later.

Include:

- connection/capability status;
- training and nutrition context projections;
- meal-plan and workout-plan read/write;
- food, workout, hydration, grocery, task, and progress actions;
- correction and deletion tools with appropriate confirmation.

Exclude:

- admin tools;
- deprecated aliases;
- AI action-request queue tools;
- internal debugging and operational tools;
- unrestricted full-profile exports;
- detailed medical-condition, medication, clinician-note, treatment, pregnancy-medical, and eating-disorder tools;
- tools without explicit output schemas and production tests.

## 4. Public tool requirements

Every public tool must define:

- canonical name;
- clear neutral title and description;
- strict input schema;
- explicit output schema;
- required OAuth scopes;
- read/write/destructive/idempotent annotations;
- server-side ownership checks;
- bounded structured output;
- safe error behavior;
- positive, negative, authorization, and retry tests.

## 5. Context architecture

Public context tools return task-specific projections, not the full account.

Required examples:

- `get_training_planning_context`;
- `get_nutrition_planning_context`;
- `get_workout_adjustment_context`;
- `get_daily_execution_context`;
- `get_progress_summary_context`.

Final names may change, but the minimum-context rule may not.

## 6. Functional constraints

Plaivra may expose user-authored functional fitness constraints after separate permission, such as movements or activities to avoid.

Public v1 must not expose detailed clinical records or infer diagnoses.

## 7. Authentication

CIMD is the target ChatGPT client-identification architecture. See `cimd-authentication-architecture.md`.

The MCP server validates token signature, issuer, audience/resource, expiry, scope, active connection, current saved permissions, user ownership, and revocation on every request.

## 8. Execution rules

- Advisory requests remain read-only.
- Executable requests require clear user intent and appropriate tool permissions.
- Destructive actions require explicit confirmation before the tool call.
- No success claim before a successful tool result.
- Repeated calls must be idempotent where duplication is harmful.
- ChatGPT-created records are normal user-owned Plaivra records and remain editable/deletable.

## 9. Submission readiness

Before submission:

- deploy the exact reviewed commit;
- scan the production MCP catalog;
- complete CIMD/OAuth production tests;
- provide a synthetic fully featured reviewer account;
- provide privacy, terms, support, and domain-verification endpoints;
- test read, write, destructive, denied, revoked, retry, duplicate, and cross-user scenarios;
- ensure the submitted tool catalog exactly matches documentation and evidence.
