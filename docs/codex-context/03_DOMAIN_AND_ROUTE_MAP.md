# Domain and Route Map

> Generated: `2026-07-29T15:37:00+02:00`
> Repository: `ahmedmohameda7222-ship-it/gymsands`
> Canonical base: `main@2169527efc3c2cd4210fc358a58c6bce37f1788b`
> Active-work overlay: `PR #90@e4cfca2f909912fa3041cebaf5689944dc655339`
> Freshness: verify the manifest and Git diff before relying on this snapshot. Exact source, migrations, tests, and workflows remain executable truth.

This is a navigation map, not a complete route inventory. Search only inside the selected domain after choosing an entry point.

| Domain | Main routes / entry points | Primary source areas | Durable ownership |
|---|---|---|---|
| Public/auth | `/`, `/about`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/welcome` | `app/`, auth helpers under `lib/`, profile services | Supabase Auth, profiles, consent/account records |
| Today / daily execution | private landing and daily task surfaces | `app/(private)/`, daily components, task/habit services | user task, habit and execution records |
| Workouts hub | `/workouts` | `app/(private)/workouts/`, `components/workouts/`, workout services | plans, sessions, exercise logs |
| Workout plans | `/my-workout/plans/builder`, `/workouts/[id]` | plan builder/components, train services | canonical plan hierarchy plus bounded compatibility writer |
| Active Workout | `/workouts/session/[id]` | `components/workouts/active-workout/`, `lib/workouts/`, workout database services | `workout_sessions` and owner-bound execution/prescription/log children |
| History | `/workout-history` | history components/services | completed/cancelled sessions and performed logs |
| Exercise library | `/my-workout/exercises/[exerciseId]` and workout library surfaces | exercise display/catalog services, Muscle Intelligence mapping registry | main-app `exercises`; external Activity Catalog remains isolated |
| Personal records | `/personal-records` | workout performance services and PR components | structured performed metrics |
| Eat / nutrition | `/calories`, `/calories/food-hub`, `/calories/weekly-overview` | calorie/nutrition components and services | food logs, targets, plans, saved recipes |
| Progress | progress/chart surfaces under private app | progress components/services | progress measurements and derived visualization |
| Wellness | `/wellness`, `/sleep-recovery`, `/hydration`, `/supplements`, `/habits` | `components/lifestyle/`, wellness services | owner-bound lifestyle logs |
| Daily tasks | `/daily-fit-tasks` | task components/services | owner-bound task state |
| Settings | `/settings` and account/preferences/reminders/privacy/nutrition/coaching/connections/subscription children | settings components, auth/privacy/billing/MCP services | settings, permissions, consents, connections, entitlements |
| ChatGPT connection | `/settings/connections/chatgpt`, `/oauth/authorize`, auth completion routes, `/api/mcp` | `docs/chatgpt-app/`, `lib/mcp/`, OAuth routes | OAuth/CIMD, connection permissions, audit/idempotency |
| Admin | `/admin`, `/admin/users`, `/admin/api-status` | private admin routes and service-role-only services | protected operational/admin records |
| Legal/privacy | `/legal/*`, settings data privacy | legal docs, `lib/privacy/`, privacy services | consent, export, deletion and retention lifecycle |

## Domain selection rule

Before editing:

1. identify the canonical domain root;
2. identify its service/write authority;
3. identify privacy/export/deletion impact;
4. identify MCP projection/tool impact;
5. identify tests and SQL verification;
6. expand to another domain only when an explicit dependency proves it necessary.

## Cross-domain dependencies to check

- Profile/context affects task-specific MCP projections.
- Workout execution feeds history, PRs, Muscle Intelligence and privacy export/deletion.
- Nutrition targets affect daily/weekly summaries and meal-plan execution.
- Settings affect language, theme, permissions, reminders, connections and entitlements.
- Exercise identities connect plans, performed logs, catalog display and immutable muscle mappings.
