# Plaivra Agent Configuration

This directory intentionally contains a small local Codex/Ruflo skill surface.

Product and engineering authority is defined in:

- `AGENTS.md`
- `docs/product/PLAIVRA_PRODUCT_CONSTITUTION.md`
- the task-specific architecture or design document

## Enabled local skills

- `swarm-orchestration` — repo-wide work that has genuinely independent workstreams
- `memory-management` — reusable implementation context
- `security-audit` — auth, MCP, privacy, Supabase, and sensitive-data review
- `performance-analysis` — measured performance investigation
- `agent-coder` — implementation
- `agent-reviewer` — focused code and architecture review
- `agent-tester` — verification

Do not restore the removed generic skill corpus unless a recurring Plaivra use case is demonstrated.

## Model selection

Model and reasoning level are chosen per task in Codex CLI. They are not hardcoded in `.agents/config.toml`.

Repository size alone does not justify maximum or parallel reasoning. Use the smallest relevant scope and the lightest model/reasoning combination that can meet the quality requirement.

## Invocation

Skills use `$skill-name` syntax. Use only the skills needed for the current task; do not invoke every enabled skill by default.
