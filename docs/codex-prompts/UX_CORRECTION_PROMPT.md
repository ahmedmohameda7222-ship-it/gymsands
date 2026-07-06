# Plaivra Codex UX Correction Prompt

**Version:** 2026.1
**Status:** Active prompt builder

This file stores the Codex CLI correction prompt assembled from completed Plaivra UX audits.

Source documents:

- `CHATGPT_CODEX_PROMPT_RULES.md`
- `Ruflo_usage.md`
- `docs/ux-constitution/README.md`
- `docs/ux-constitution/motion-and-interaction.md`
- `docs/ux-progress/README.md`
- `docs/platform-roadmap/README.md`

Current completed audits:

- `/dashboard` — audited, score 72/100, fixes open

Recommended current setup for the dashboard-only correction:

- Codex mode: high plus advisor
- Start with: `/caveman lite`
- Skills: `$memory-management $agent-coder $agent-reviewer $agent-tester`
- Advisor: strict senior mobile product engineer + premium UX reviewer

Future multi-route correction bundle setup:

- Codex mode: high plus advisor, or xhigh plus advisor only for a large multi-route batch
- Start with: `/caveman lite`
- Skills: `$swarm-orchestration $memory-management $agent-reviewer $agent-tester`
- Advisor: strict senior mobile product engineer + release-quality UX auditor + regression reviewer

## Current prompt sections

1. Dashboard correction prompt: pending detailed insertion.

## Future route correction template

For every audited route, append:

- route
- audit score
- recommended mode
- skills
- relevant files
- do-not-touch list
- required fixes
- acceptance criteria
- verification steps
