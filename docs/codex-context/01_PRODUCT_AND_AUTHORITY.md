# Product and Authority

> Generated: `2026-07-29T15:37:00+02:00`
> Repository: `ahmedmohameda7222-ship-it/gymsands`
> Canonical base: `main@2169527efc3c2cd4210fc358a58c6bce37f1788b`
> Active-work overlay: `PR #90@e4cfca2f909912fa3041cebaf5689944dc655339`
> Freshness: verify the manifest and Git diff before relying on this snapshot. Exact source, migrations, tests, and workflows remain executable truth.

## Product definition

Plaivra is a user-controlled persistent fitness context, execution, tracking, history, and visualization platform designed to work with ChatGPT.

The canonical flow is:

```text
user-owned Plaivra context
→ task-specific permission and projection
→ minimum authorized context to ChatGPT
→ reasoning and authorized tool execution
→ structured Plaivra persistence
→ user review, tracking, correction, export or deletion
```

## Responsibility split

**ChatGPT owns reasoning and intelligent execution.**

It interprets intent, uses authorized context, creates or adapts plans, explains progress, and calls allowed Plaivra tools.

**Plaivra owns durable product control.**

It owns authentication, authorization, user ownership, validation, persistence, direct execution, visualization, history, correction, permissions, privacy, export, deletion, and revocation.

## Non-goals

Do not turn Plaivra into:

- an in-app chatbot competing with ChatGPT;
- a copy-and-paste document import queue;
- a second approval queue after a successful authorized tool call;
- a medical diagnostic or prescription system;
- unrestricted whole-account context access for ChatGPT;
- a second data silo for records created through ChatGPT;
- a generic manual-first tracker.

Direct UI controls remain valid for fast execution and correction.

## Stable product rules

- Return task-specific context, never the complete profile by default.
- Separate stored private data from ChatGPT-shareable context.
- Enforce read/write permissions and revocation server-side.
- Public ChatGPT tools are allowlisted and must use domain services.
- Admin member-data tools are never exposed through public member OAuth.
- Destructive actions require explicit confirmation.
- Do not report success before a tool confirms persistence.
- Web is the active product surface; native apps remain future work.
- Provider identity is metadata, not a separate product domain.
- User ownership, security, migration integrity and privacy survive pre-launch restructuring.

## Fast authority routing

| Question | Open first |
|---|---|
| Product purpose or UX rule | `docs/product/PLAIVRA_PRODUCT_CONSTITUTION.md` |
| Long-term platform order | `docs/product/PLAIVRA_LONG_TERM_PRODUCT_AND_PLATFORM_PLAN.md` |
| AI-first tracking model | `docs/product/ai-first-tracker-model.md` |
| Cross-platform visual behavior | `docs/design-system/PLAIVRA_CROSS_PLATFORM_UI_CONSTITUTION.md` |
| ChatGPT app / MCP | `docs/chatgpt-app/README.md` |
| OAuth/CIMD | `docs/chatgpt-app/cimd-authentication-architecture.md` |
| Canonical data ownership | `docs/architecture/canonical-domain-model.md` |
| Database history | `docs/architecture/migration-ledger-reconciliation.md` and `supabase/migration-ledger.json` |
| Roadmap | `docs/platform-roadmap/README.md` |
| CI/release/deploy | `docs/release/README.md` |

## Evidence versus authority

- Current authority documents define accepted direction.
- Source, migrations, tests and workflows prove current implementation.
- Git history, old prompts, completed reports and artifacts are evidence only.
- Active PR overlays are never canonical before merge.
