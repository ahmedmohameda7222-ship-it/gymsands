# Plaivra Codex UX Correction Prompt

**Version:** 2026.1  
**Status:** Active compact prompt registry

Read first:

- `CHATGPT_CODEX_PROMPT_RULES.md`
- `Ruflo_usage.md`
- `docs/product/ai-first-tracker-model.md`
- `docs/ux-constitution/README.md`
- `docs/ux-constitution/flow-and-workflow-audit.md`
- `docs/ux-constitution/motion-and-interaction.md`
- `docs/ux-progress/README.md`
- `docs/platform-roadmap/README.md`

Product rule: Plaivra is AI-first where appropriate, but not every route is ChatGPT-first. Manual entry remains fallback, correction, or advanced control where the route role calls for it.

---

## Audited route registry

| Route / area | Score | Full audit |
|---|---:|---|
| `/dashboard` | 72 | tracker notes |
| `/onboarding?edit=true` | 66 | tracker notes |
| `/my-workout/plans` | 63 | `docs/ux-progress/routes/my-workout-plans.md` |
| `/workouts/session/day/[dayId]` | 58 | `docs/ux-progress/routes/workout-session-day.md` |
| `/my-workout/day/[dayId]` | 59 | `docs/ux-progress/routes/workout-day-editor.md` |
| `/workouts` | 58 | `docs/ux-progress/routes/exercise-library.md` |
| `/workout-history` | 60 | `docs/ux-progress/routes/workout-history.md` |
| Global app shell / navigation | 63 | `docs/ux-progress/routes/global-app-shell.md` |
| `/calories/food-hub` | 55 | `docs/ux-progress/routes/food-hub.md` |
| `/calories/weekly-overview` | 57 | `docs/ux-progress/routes/weekly-overview-reports.md` |
| `/personal-records` | 56 | `docs/ux-progress/routes/personal-records.md` |
| `/habits` | 58 | `docs/ux-progress/routes/habits.md` |
| `/sleep-recovery` | 57 | `docs/ux-progress/routes/sleep-recovery.md` |
| `/supplements` | 56 | `docs/ux-progress/routes/supplements.md` |
| `/daily-fit-tasks` | 61 | `docs/ux-progress/routes/daily-fit-tasks.md` |
| `/settings/account` | 59 | `docs/ux-progress/routes/account-settings.md` |
| Public landing/auth | 55 | `docs/ux-progress/routes/public-landing-auth.md` |
| `/calories` | 54 | `docs/ux-progress/routes/calories.md` |
| `/my-meal-plan` | 57 | `docs/ux-progress/routes/my-meal-plan.md` |
| `/hydration` | 68 | `docs/ux-progress/routes/hydration.md` |
| `/wellness` | 60 | `docs/ux-progress/routes/wellness.md` |
| `/progress` | 62 | `docs/ux-progress/routes/progress.md` |
| `/settings` | 64 | `docs/ux-progress/routes/settings.md` |
| `/settings/ai-imports` | 66 | `docs/ux-progress/routes/settings-ai-imports.md` |
| `/settings/data-privacy` | 61 | `docs/ux-progress/routes/settings-data-privacy.md` |
| `/settings/preferences` | 62 | `docs/ux-progress/routes/settings-preferences.md` |

---

## Standard correction setup

```text
/caveman lite
$memory-management $agent-reviewer $agent-coder $agent-tester
Mode: high plus advisor
Advisor: strict senior mobile product engineer + premium UX reviewer
```

For personal user data, permissions, health data, nutrition data, reports, account actions, consent flows, or AI apply flows, include the project security review skill listed in `Ruflo_usage.md`.

---

## Current focused prompt — Public Landing/Auth correction

```text
/caveman lite
$memory-management $security-audit $agent-reviewer $agent-coder $agent-tester

Mode: high plus advisor
Advisor: strict senior mobile product engineer + AI-first product positioning reviewer + auth/consent safety reviewer + reduced-motion reviewer

Task: Implement audited Public Landing/Auth UX corrections.

Primary surfaces:
- /
- /login
- /register
- /auth/oauth-complete
- /auth/consent-completion
- /forgot-password
- /reset-password

Read first:
- docs/ux-progress/routes/public-landing-auth.md
- app/page.tsx
- components/layout/public-nav.tsx
- components/layout/public-footer.tsx
- components/auth/auth-page.tsx
- components/auth/auth-form.tsx
- components/auth/oauth-complete-client.tsx
- components/auth/consent-completion-client.tsx
- app/forgot-password/page.tsx
- app/reset-password/page.tsx

Product role:
- Landing must explain Plaivra's AI-first tracker/control-layer model.
- Auth must preserve existing email/password, Google OAuth, consent, and password recovery semantics.

Required landing flow:
- AI-first hero -> 5-second workflow visual -> product UI cards -> trust/control strip -> clear auth CTA.

Required auth flow:
- Auth form -> inline validation/errors -> OAuth pending/recovery -> consent completion -> recovery/reset success/failure.

Required fixes:
1. Reframe landing hero around AI-first workflow: ChatGPT/context -> approval -> Plaivra tracking/visualization.
2. Replace stock fitness photo carousel with product UI cards/workflow visuals.
3. Reframe feature grid from module list to approved-import workflows.
4. Add trust/control strip: approval before tracking, no silent AI changes, privacy/health links.
5. Keep login/privacy/legal reachable on mobile public nav.
6. Add OAuth pending state to Google sign-in and prevent repeated taps.
7. Add inline auth form error/success states in addition to toast.
8. Replace Suspense fallback={null} on auth callback/consent routes with branded loading states.
9. Resize OAuth retry, consent rows/checks, and mobile nav/auth controls to 48px targets.
10. Add inline consent save failure state.
11. Add inline forgot-password reset-link-sent state.
12. Add reset-password inline error and password visibility/requirements parity with register.
13. Ensure English and Arabic public copy stay aligned.
14. Gate or disable public hero animation under reduced-motion settings.

Do not:
- Do not change database schema.
- Do not change auth semantics.
- Do not change consent semantics.
- Do not change AI import/apply behavior.
- Do not change private app route behavior.
- Do not make Plaivra look like a manual calorie tracker, generic gym app, or food database.
- Do not add stock bodybuilding imagery.

Verification:
- Run typecheck, lint, and build if feasible.
- Test /, /login, /register, /auth/oauth-complete, /auth/consent-completion, /forgot-password, and /reset-password at 390x844.
- Verify landing explains the workflow in five seconds.
- Verify product UI cards/workflow visuals replace stock photos.
- Verify mobile nav keeps sign in and trust/legal access reachable.
- Verify OAuth has pending state and repeated-click prevention.
- Verify auth errors appear inline.
- Verify OAuth and consent fallbacks are branded, not blank.
- Verify consent rows/checks meet 48px effective target.
- Verify forgot/reset password have inline success/error states.
- Verify reduced-motion disables/gates hero animation.
- Verify Arabic and English public/auth copy remain coherent.
- Review git diff before final report.
```
