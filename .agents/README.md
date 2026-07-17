# Plaivra optional agent skills

This directory contains optional specialist skills. It is not a mandatory execution stack.

Current authority:

- `AGENTS.md`
- `CHATGPT_CODEX_PROMPT_RULES.md`
- the minimum task-specific product, architecture, design, database, and test contracts

## Default

Use one Codex executor with agents and Ruflo off.

Enable a specialist skill only when the approved prompt identifies a genuine independent need:

- `security-audit` for a bounded auth, MCP, privacy, Supabase, or sensitive-data review;
- `performance-analysis` for measured performance investigation;
- `agent-reviewer` or `agent-tester` for an independent workstream that does not duplicate the executor;
- `memory-management` only for reusable implementation facts;
- `swarm-orchestration` only for truly independent repo-wide workstreams with clear ownership.

Do not invoke coder/reviewer/tester/security stacks automatically. Coordination does not replace implementation, source inspection, SQL verification, tests, or independent quality control.
