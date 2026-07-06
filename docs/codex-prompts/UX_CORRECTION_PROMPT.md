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
- Model: use the strongest reliable reasoning model available in Codex CLI; high reasoning is enough for the dashboard-only task.

Future multi-route correction bundle setup:

- Codex mode: high plus advisor, or xhigh plus advisor only for a large multi-route batch
- Start with: `/caveman lite`
- Skills: `$swarm-orchestration $memory-management $agent-reviewer $agent-tester`
- Advisor: strict senior mobile product engineer + release-quality UX auditor + regression reviewer

---

## Paste-ready prompt section 1 — Dashboard correction

Use this only when you want Codex to implement the dashboard P1 fixes.

```text
/caveman lite

$memory-management $agent-coder $agent-reviewer $agent-tester

Task:
Implement the audited P1 dashboard UX corrections for Plaivra.

Mode:
high plus advisor

Advisor:
Act as a strict senior mobile product engineer and premium UX reviewer. Optimize for launch-quality mobile-first behavior, not decoration.

Read first:
1. CHATGPT_CODEX_PROMPT_RULES.md
2. Ruflo_usage.md
3. docs/ux-constitution/README.md
4. docs/ux-constitution/motion-and-interaction.md
5. docs/ux-progress/README.md, especially the /dashboard audit

Before editing:
1. Use memory_search.
2. Inspect only relevant dashboard files.
3. Make a short plan.
4. Make the smallest clean change.

Primary route:
- /dashboard

Inspect first:
- app/(private)/dashboard/page.tsx
- components/dashboard/dashboard-sections.tsx
- components/dashboard/metric-card.tsx
- components/ui/button.tsx
- components/motion/index.tsx
- lib/motion.ts

Do not touch unrelated routes, env files, database schema, migrations, auth, API routes, MCP routes, onboarding, settings, subscriptions, or global theme unless required for a small reusable primitive.

Audit result:
/dashboard score is 72/100. The route is useful but not premium-ready because actions compete, repeated actions are not optimistic enough, and some UI feels dense/static.

Required fixes:
1. Add a clearer single Next Best Action experience using existing dashboard data only.
2. Demote duplicated or competing CTAs instead of removing useful functionality.
3. Add optimistic UI and pending protection for dashboard water quick add.
4. Add optimistic UI and pending protection for dashboard meal Done.
5. Make Done dominant and Skip secondary in meal rows.
6. Restyle the meal type selector into a calmer segmented or horizontal selector.
7. Use existing motion utilities/tokens only where motion clarifies feedback or state change.
8. Do not redesign the whole dashboard.
9. Do not implement unrelated P2 polish unless directly needed for a P1 fix.

Acceptance criteria:
1. One obvious next best action is visible within two seconds.
2. Dashboard no longer feels like several equal CTAs competing at once.
3. Water quick add gives immediate visual feedback and blocks duplicate rapid taps.
4. Meal Done gives immediate visual feedback and blocks duplicate rapid taps.
5. Failed optimistic water/meal actions roll back cleanly and show existing safe toast behavior.
6. Done is visually dominant and Skip is secondary.
7. Meal type selector is calmer and clearer.
8. Existing loading, empty, error, retry, AI approval, privacy, and auth behavior remain intact.
9. No unrelated routes are changed.

Verification:
1. Run npm run typecheck.
2. Run npm run lint.
3. Run npm run build if feasible.
4. Inspect /dashboard around 390x844 mobile width.
5. Verify optimistic water add success, duplicate protection, and rollback behavior.
6. Verify optimistic meal Done success, duplicate protection, and rollback behavior.
7. Run git diff --stat and review the diff.

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

## Future route correction template

For every audited route, append:

- route
- audit score
- recommended mode
- skills
- advisor
- relevant files
- do-not-touch list
- required fixes
- acceptance criteria
- verification steps
