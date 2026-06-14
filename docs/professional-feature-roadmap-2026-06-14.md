# Professional feature roadmap - 2026-06-14

FitLife Hub is a responsive web app for storing, scheduling, editing, displaying, and tracking plans created outside the app. It must not become a native app project, app-store project, or internal workout-plan generator.

## Read-only audit summary

- The app already has strong foundations: Next.js App Router, account auth, Supabase-backed workouts, meals, water logs, progress, wellness, reports, PRs, admin food/exercise tools, and a ChatGPT connector.
- Phase 1 beginner trust gaps remain around import guidance, visual dashboard clarity, hydration depth, and roadmap clarity.
- Several professional-account features need migrations later, especially custom exercise preferences, exercise favorites, meal templates, batch meals, shopping-list checks, food shortcuts, reminders, and account-level UI preferences.
- Existing migration numbering has collisions. Production-safe work should not rename applied migration files; use documentation plus future unique prefixes.
- Supabase changelog check on 2026-06-14 flagged the current Data API exposure/RLS caution for new tables, so new account-sync tables should be done as a deliberate migration phase.

## Recommended information architecture

- Today: command center, setup checklist, coaching, immediate actions, adherence rings.
- Train: workout plans, active workout, exercise library, workout history, personal records.
- Eat: calories, meal plan, custom foods/meals, barcode tools, weekly nutrition summary.
- Hydration: daily water target, quick add, manual add, timeline, weekly summary, streaks.
- Progress: weight, measurements, photos, trends, progress insights.
- Wellness: habits, sleep/recovery, supplements, daily fit tasks, recovery suggestions.
- Settings: ChatGPT import wizard, connected apps, profile/setup links.
- Admin: food, exercises, videos, imports, API status, audit/quality, welcome/settings.

## Phase 1 - foundation and beginner experience

Goal: make the first week clear, trustworthy, and premium without adding risky new schema.

Implemented in this slice:

- More visual Today command center with real-data rings for today score, training streak, protein, and water.
- Hydration upgraded with manual add, timeline, weekly summary, target days, streak, and reminder suggestions.
- ChatGPT import wizard upgraded with copyable workout and meal prompts, plus post-import quality checks.
- Professional roadmap documented in-repo for Phase 2-4 execution.

Already in place from the previous reliability pass:

- Beginner setup checklist using real completion checks.
- Real account-backed hydration baseline.
- User-safe error language.
- Automatic PR detection for single-workout saved set logs.
- Safer single-workout set persistence.
- README migration collision documentation.

Deferred from Phase 1:

- Cloud-synced custom exercises and favorites.
- Meal template, batch meal, and shopping-list persistence.
- Server-side reminders.
- Data export.
- Advanced coaching automation.

## Phase 2 - cloud sync and tracking quality

Goal: make important user data follow the account across devices.

Recommended implementation:

- Add `user_exercise_preferences` with `user_id`, `exercise_id`, `custom_exercise_id`, `favorite`, `hidden`, notes, timestamps.
- Add `user_custom_exercises` for account-owned custom movements, video URL, equipment, muscles, instructions, and active/archive state.
- Add `user_meal_templates`, `user_batch_meals`, `user_batch_meal_items`, and `user_shopping_list_checks`.
- Add `user_food_shortcuts` for frequent/recent/favorite food logging preferences.
- Use RLS owner policies and explicit Data API grants where required by project settings.
- Extend migration docs with a unique post-020 prefix. Do not rename legacy duplicate prefixes.

## Phase 3 - smart coaching and automation

Goal: provide useful guidance from existing data only.

Recommended implementation:

- Progressive overload recommendations from previous completed exercise logs.
- Weekly coaching review combining workouts, skipped days, calories, protein, water, weight trend, and recovery trend.
- Recovery-based training suggestion using sleep, soreness, fatigue, and stress.
- Macro-aware food suggestions from real saved meals and foods.
- Plan and meal adherence scoring with missed/planned/completed breakdowns.
- Browser notification prompts only as optional local reminders; for reliable reminders, design server-side scheduled jobs plus email/push provider.

## Phase 4 - advanced professional features

Goal: compete with serious tracking apps while keeping FitLife focused.

Recommended implementation:

- Data export for workouts, food logs, progress, body measurements, photo metadata, meal plans, and shopping lists.
- Advanced nutrition quality fields and verified food review workflows.
- Offline-safe draft logging for workout sets and meals, with explicit unsynced state and conflict handling.
- PWA install polish, app icons, offline fallback, and safe cache strategy.
- Larger mobile workout mode with active set focus, rest timer, previous/next exercise movement, and fewer taps.
- Advanced reports and trend charts for adherence, strength, hydration, recovery, and body composition.

## Phase 2 follow-up prompt

Implement Phase 2 cloud sync. Start with a read-only audit of current custom exercise, exercise favorite, meal template, batch meal, shopping-list, and quick-food storage. Add RLS-safe Supabase migrations with unique post-020 migration names. Move only the safest account-level data first, keep device-only drafts clearly labeled, run lint/typecheck/build, and push to GitHub.

## Phase 3 follow-up prompt

Implement Phase 3 smart coaching. Use only existing real saved workout, nutrition, hydration, progress, and recovery data. Add progressive overload suggestions, weekly coaching review, recovery-based training guidance, macro-aware food suggestions, and adherence summaries. Do not generate workout plans internally. Run lint/typecheck/build and push to GitHub.

## Phase 4 follow-up prompt

Implement Phase 4 professional features. Add data export, PWA install polish, offline-safe draft states, advanced mobile workout mode, and richer reports. Do not add native app store code. Avoid fake data and clearly label unsynced drafts. Run lint/typecheck/build and push to GitHub.
