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
- `/onboarding?edit=true` — audited, score 66/100, fixes open

Recommended current setup for a one-route UI correction:

- Codex mode: high plus advisor
- Start with: `/caveman lite`
- Skills for UI-only route work: `$memory-management $agent-coder $agent-reviewer $agent-tester`
- Skills for onboarding/auth/AI/user-data-adjacent work: `$memory-management $security-audit $agent-reviewer $agent-coder $agent-tester`
- Advisor: strict senior mobile product engineer + premium UX reviewer
- Model: use the strongest reliable reasoning model available in Codex CLI; high reasoning is enough for one-route tasks.

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

## Paste-ready prompt section 2 — Onboarding edit correction

Use this only when you want Codex to implement the `/onboarding?edit=true` P0/P1 fixes.

```text
/caveman lite

$memory-management $security-audit $agent-reviewer $agent-coder $agent-tester

Task:
Implement the audited P0/P1 onboarding edit UX corrections for Plaivra.

Mode:
high plus advisor

Advisor:
Act as a strict senior mobile product engineer, premium onboarding UX reviewer, and user-data safety reviewer. Optimize for reliable profile editing, not visual decoration.

Read first:
1. CHATGPT_CODEX_PROMPT_RULES.md
2. Ruflo_usage.md
3. docs/ux-constitution/README.md
4. docs/ux-constitution/motion-and-interaction.md
5. docs/ux-progress/README.md, especially the /onboarding?edit=true audit

Before editing:
1. Use memory_search.
2. Inspect only relevant onboarding/profile/AI-permission files.
3. Make a short plan.
4. Make the smallest clean change.

Primary route:
- /onboarding?edit=true

Inspect first:
- app/(private)/onboarding/page.tsx
- services/database/profile.ts
- services/database/ai-permissions.ts
- components/ui/button.tsx
- components/ui/progress.tsx
- components/motion/index.tsx
- lib/motion.ts

Do not touch unrelated routes, dashboard, workout pages, calorie pages, meal pages, env files, database schema, migrations, payment/subscription files, MCP routes, or global theme unless required for a tiny reusable primitive.

Audit result:
/onboarding?edit=true score is 66/100. The route is functional but not launch-quality because it shows irrelevant target weight, has saved-data loading risk, uses several 44px controls, has abrupt step changes, and needs stronger AI permission trust framing.

Required fixes:
1. P0: Fix conditional Target weight visibility.
   - Show target weight only when selected goals include weight/body-composition goals or a saved target weight exists.
   - Weight/body-composition goals: Lose fat, Build muscle, Body recomposition, Improve health.
   - Hide the whole Target weight section for non-weight goals when no saved target weight exists.
   - Do not leave blank space.
   - If hiding because goals are non-weight-related, do not force-clear saved target weight unless the existing product logic already requires it.

2. Add an edit-mode saved-answer loading gate.
   - In edit mode, do not let the user edit default answers before saved onboarding and AI permissions resolve.
   - Prevent late saved data from overwriting user edits.
   - Add a clear loading state and safe error/retry behavior.

3. Add subtle step transition motion.
   - Use existing motion utilities/tokens where possible.
   - Step changes should feel guided, not static.
   - Respect reduced-motion behavior.
   - Do not add decorative animation.

4. Fix touch target baseline.
   - Step chips, schedule day buttons, stepper plus/minus buttons, stepper input shell, and permission toggles must have at least 48px effective tap area.
   - Do not make the UI bulky; improve tap area cleanly.

5. Improve AI permission trust framing.
   - Full AI Access should clearly explain broad read/write access.
   - Write access should clearly state that it includes read access.
   - The Review step should summarize AI access clearly before Save.
   - Do not silently change permission semantics.

6. Make mobile step navigation calmer.
   - The 8-step horizontal chip strip should not feel like the main action area.
   - Keep all steps reachable, but demote/restyle the strip if needed.
   - Back/Next/Save remain the main navigation actions.

Do not redesign the whole onboarding flow.
Do not change database schema or auth behavior.

Acceptance criteria:
1. Target weight is hidden for non-weight goals when no saved target weight exists.
2. Target weight is visible for Lose fat, Build muscle, Body recomposition, or Improve health.
3. Target weight remains visible if a saved target weight exists, with clear context.
4. Edit mode waits for saved onboarding and AI permission data before editable defaults appear.
5. Saved data cannot overwrite user edits after loading completes.
6. All relevant onboarding controls meet 48px effective tap target.
7. Step transitions are subtle and reduced-motion-safe.
8. AI Full Access and Write Access are explained clearly before saving.
9. Back/Next/Save remain sticky, mobile-safe, and clear.
10. Save still persists onboarding, profile target/body goal, and AI permissions correctly.
11. No unrelated routes are changed.

Verification:
1. Run npm run typecheck.
2. Run npm run lint.
3. Run npm run build if feasible.
4. Inspect /onboarding?edit=true around 390x844 mobile width.
5. Test non-weight goals: Improve endurance, Improve mobility, Reduce stress, Improve strength.
6. Test weight-related goals: Lose fat, Build muscle, Body recomposition, Improve health.
7. Test edit mode with saved target weight and non-weight goals.
8. Verify saved onboarding values load before editing is allowed.
9. Verify AI permission summary and save behavior.
10. Run git diff --stat and review the diff.

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
