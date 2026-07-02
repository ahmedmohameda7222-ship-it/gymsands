# Plaivra MCP Tool and Scope Mapping

Source of truth inspected on 2026-07-02:

- Tool definitions and risk annotations: `lib/mcp/tools.ts`
- Tool-to-scope mapping and catalog filtering: `lib/mcp/server.ts`
- Scope expansion and saved-permission rules: `lib/mcp/scopes.ts`
- Input/output controls: `lib/mcp/safety.ts`
- Audit redaction: `lib/mcp/audit.ts`

The registry contains 80 tools. A tool is shown only when `canUseTool` finds an explicit mapping and the authenticated connection has an allowed scope. Write implies read only within the same section. Full Access expands to normal user scopes only.

## Output-control legend

- **O1 - owner/minimized:** Server operations are scoped to the authenticated owner. The common sanitizer removes internal `user_id`/owner/profile/tenant/connection identifiers, raw `notes`, internal create/update timestamps, tokens, secrets, authorization codes, passwords, and service-role material. Token-like text is redacted. Arrays are capped at 100 items, strings at 4,000 characters, and nesting at depth 10.
- **O2 - reference plus owner/minimized:** The tool may include public/global reference records as well as owner records; O1 sanitization still applies.
- **O3 - cross-category owner/minimized:** The tool intentionally summarizes several authorized owner categories; O1 sanitization still applies. `get_today_summary` is limited to explicit Full Access.
- **O4 - internal admin/minimized:** The definition is outside the normal public OAuth grant and hidden from ordinary users. O1 sanitization still applies if reached through a separately authorized internal admin context.
- **O5 - disabled compatibility response:** The handler returns a disabled response and does not read or mutate member data.

The output sanitizer does not remove task-relevant fitness values such as calories, weight, body measurements, sleep, or supplement tracking when the tool and scope require them. Those values are sensitive and must be disclosed and minimized at the tool-purpose level. Audit/activity records use a separate allowlist and exclude raw prompts, free text, names, weight/body values, tokens, paths, URLs, emails, and user/connection IDs.

## Account and combined context

| Tool | Description | Action | Required scope(s) | User data touched | Output note | Confirm? | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `get_fitlife_status` | Validate the connection and return linked Plaivra account identity. | Read | `plaivra.profile.read` | Linked account name/email and connection status context | O1; internal IDs removed | No | read |
| `get_user_profile` | Return profile, onboarding, calorie targets, goal, training level, and water target. | Read | `plaivra.profile.read` | Profile, goals, training level, onboarding and targets | O1 | No | read |
| `get_today_summary` | Return today's calorie totals, planned meals, workout, and water total. | Read | `plaivra.full_access` or legacy `plaivra.all` | Nutrition, meal-plan, workout, and hydration daily summary | O3 | No | read |

`plaivra.all` is a legacy mapping accepted by `requiredScopesForTool`; saved user permissions and normal OAuth scope filtering do not grant it. It should not be advertised as a public grant.

## Food and nutrition

| Tool | Description | Action | Required scope(s) | User data touched | Output note | Confirm? | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `search_foods` | Search global and user foods before logging ambiguous foods. | Read | `plaivra.nutrition.read` | Public/global food references and user foods | O2 | No | read |
| `create_kitchen` | Create a named user-owned custom-food collection. | Write | `plaivra.nutrition.write` | User kitchen name | O1 | No server confirm | low |
| `get_kitchens` | List user and system kitchens. | Read | `plaivra.nutrition.read` | User kitchens and system collections | O2 | No | read |
| `update_kitchen` | Rename a user-owned kitchen. | Write | `plaivra.nutrition.write` | User kitchen name | O1 | No server confirm | medium |
| `delete_kitchen` | Permanently delete a user-owned food collection. | Destructive | `plaivra.nutrition.write` | User kitchen/collection | O1 | **Yes, `confirm:true`** | high |
| `assign_food_to_kitchen` | Assign a user food item to a kitchen. | Write | `plaivra.nutrition.write` | User food-to-kitchen relationship | O1 | No server confirm | low |
| `get_foods_by_kitchen` | Return foods assigned to a kitchen. | Read | `plaivra.nutrition.read` | Foods in the selected owned/system kitchen | O2 | No | read |
| `add_food_log` | Log meal items using Plaivra nutrition data; return candidates when ambiguous. | Write | `plaivra.nutrition.write` | Eaten foods, quantities, meal type, date and calculated macros | O1; ambiguous candidates minimized | No server confirm | low |
| `get_food_logs_by_date` | List food logs for a date before editing or deleting. | Read | `plaivra.nutrition.read` | Daily eaten-food logs and macros | O1 | No | read |
| `update_food_log` | Update a user-owned food log. | Write | `plaivra.nutrition.write` | Food-log meal, quantity, macros and optional note | O1; raw note removed from output | No server confirm | medium |
| `move_food_log_meal_type` | Move a food log to another meal type. | Write | `plaivra.nutrition.write` | Food-log meal category | O1 | No server confirm | medium |
| `delete_food_log` | Permanently delete a user-owned eaten-food log. | Destructive | `plaivra.nutrition.write` | Eaten-food log and calorie history row | O1 | **Yes, `confirm:true`** | high |
| `create_custom_food` | Create a user-owned food with nutrition and optional kitchen. | Write | `plaivra.nutrition.write` | Food name, serving, nutrition, cuisine/category and optional note | O1; raw note removed from output | No server confirm | medium |
| `create_custom_meal` | Create a saved custom meal from Plaivra foods. | Write | `plaivra.nutrition.write` | Saved meal, food items, quantities and optional note | O1; raw note removed from output | No server confirm | medium |
| `get_today_calories` | Return calorie target, consumed, remaining, and macro breakdown. | Read | `plaivra.nutrition.read` | Daily calories and macro totals/targets | O1 | No | read |

## Meal plans

| Tool | Description | Action | Required scope(s) | User data touched | Output note | Confirm? | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `get_meal_plan` | Return planned meals by date and meal type. | Read | `plaivra.meal_plans.read` | Planned food names, dates, meal types, quantities and macros | O1 | No | read |
| `get_meal_plan_for_date` | Return one date's planned meals grouped by meal type. | Read | `plaivra.meal_plans.read` | One day's planned meals | O1 | No | read |
| `get_meal_plan_for_week` | Return seven days of planned meals grouped by date and meal type. | Read | `plaivra.meal_plans.read` | One week's planned meals | O1; array cap applies | No | read |
| `create_meal_plan_item` | Create one planned meal item from a direct food name and macro values without logging it as eaten. | Write | `plaivra.meal_plans.write` | Planned food, date, meal type, serving and macros | O1 | No server confirm | low |
| `create_day_meal_plan` | Create breakfast, lunch, dinner, and snack items for one date. | Write | `plaivra.meal_plans.write` | One day's planned meals and macros | O1 | No server confirm | medium |
| `create_week_meal_plan` | Create planned meals for multiple dates without marking them eaten. | Write | `plaivra.meal_plans.write` | Multi-day planned meals and macros | O1 | No server confirm | medium |
| `update_meal_plan_item` | Update an owned planned meal without changing food logs unless later marked done. | Write | `plaivra.meal_plans.write` | One planned meal item | O1 | No server confirm | medium |
| `replace_meal_plan_item` | Compatibility alias for `update_meal_plan_item`. | Write | `plaivra.meal_plans.write` | One planned meal item | O1 | No server confirm | medium |
| `delete_meal_plan_item` | Permanently delete a planned item while preserving an already-linked eaten-food log. | Destructive | `plaivra.meal_plans.write` | Planned meal item; linked completed log retained | O1 | **Yes, `confirm:true`** | high |
| `mark_meal_plan_item_done` | Mark a planned meal done and create one idempotently linked food log. | Write | `plaivra.meal_plans.write` | Planned-item completion and eaten-food log | O1 | No server confirm | low |
| `generate_shopping_list` | Aggregate a shopping list from saved meal-plan items for a date range. | Read | `plaivra.meal_plans.read` | Planned food names and quantities | O1; returns aggregation only | No | read |

## Hydration

| Tool | Description | Action | Required scope(s) | User data touched | Output note | Confirm? | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `add_water_log` | Add hydration in milliliters. | Write | `plaivra.hydration.write` | Amount and date | O1 | No server confirm | low |
| `get_water_summary` | Return target, logged amount, remaining amount, and percentage. | Read | `plaivra.hydration.read` | Daily hydration logs and target | O1 | No | read |
| `delete_water_log` | Permanently delete a user-owned hydration log. | Destructive | `plaivra.hydration.write` | Hydration log | O1 | **Yes, `confirm:true`** | high |

## Workout plans

| Tool | Description | Action | Required scope(s) | User data touched | Output note | Confirm? | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `create_custom_workout_plan` | Save an exact ChatGPT-created workout plan; Plaivra does not generate it. | Write | `plaivra.workouts.write` | Plan metadata, days, exercises, scheduling and optional notes | O1; raw notes removed from output | No server confirm | medium |
| `save_chatgpt_workout_plan` | Alias that saves a full ChatGPT-provided plan. | Write | `plaivra.workouts.write` | Plan metadata, days and exercises | O1 | No server confirm | medium |
| `generate_workout_plan` | Deprecated alias that saves a provided plan and does not generate it. | Write | `plaivra.workouts.write` | Plan metadata, days and exercises | O1 | No server confirm | medium |
| `get_workout_plans` | List user-owned workout plans. | Read | `plaivra.workouts.read` | Plan summaries and active state | O1 | No | read |
| `get_workout_plan_by_id` | Return one owned plan with days and exercises. | Read | `plaivra.workouts.read` | Selected plan, days and exercises | O1 | No | read |
| `create_workout_plan_day` | Add a day to a user-owned workout plan. | Write | `plaivra.workouts.write` | Plan day name, order, focus, schedule and optional note | O1; raw note removed from output | No server confirm | medium |
| `update_workout_plan_day` | Update a user-owned workout day. | Write | `plaivra.workouts.write` | Plan-day metadata and schedule | O1 | No server confirm | medium |
| `delete_workout_plan_day` | Permanently delete a day and its exercises. | Destructive | `plaivra.workouts.write` | Plan day and child exercises | O1 | **Yes, `confirm:true`** | high |
| `add_exercise_to_plan_day` | Add a warmup, strength, cardio, or cooldown exercise by name. | Write | `plaivra.workouts.write` | Exercise prescription and plan-day relationship | O1 | No server confirm | medium |
| `add_warmup_to_plan_day` | Add warmup items to a plan day. | Write | `plaivra.workouts.write` | Warmup exercise items | O1 | No server confirm | medium |
| `add_cardio_to_plan_day` | Add cardio-finisher items to a plan day. | Write | `plaivra.workouts.write` | Cardio exercise items | O1 | No server confirm | medium |
| `add_cooldown_to_plan_day` | Add cooldown/stretch items to a plan day. | Write | `plaivra.workouts.write` | Cooldown exercise items | O1 | No server confirm | medium |
| `update_plan_exercise` | Update a user-owned plan exercise. | Write | `plaivra.workouts.write` | Exercise name, block, sets, reps, load, rest and instructions | O1 | No server confirm | medium |
| `delete_plan_exercise` | Permanently delete an exercise from a plan. | Destructive | `plaivra.workouts.write` | One plan exercise | O1 | **Yes, `confirm:true`** | high |
| `activate_workout_plan` | Activate one plan and deactivate all other plans. | Destructive/overwrite | `plaivra.workouts.write` | Active-plan state across the owner's plans | O1 | **Yes, `confirm:true`** | high |
| `delete_workout_plan` | Permanently delete a plan and its plan content. | Destructive | `plaivra.workouts.write` | Plan, days and exercises | O1 | **Yes, `confirm:true`** | high |

## Workout sessions and logs

| Tool | Description | Action | Required scope(s) | User data touched | Output note | Confirm? | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `get_today_workout` | Return today's scheduled workout. | Read | `plaivra.workouts.read` | Schedule, active plan day and exercises | O1 | No | read |
| `start_workout` | Start a saved scheduled session or create a basic session. | Write | `plaivra.workouts.write` | Workout schedule/session state | O1 | No server confirm | low |
| `log_exercise_sets` | Log performed sets and return personal-record candidate information. | Write | `plaivra.workouts.write` | Session, exercise, weights, reps, duration and optional notes | O1; raw notes removed from output | No server confirm | low |
| `complete_workout` | Mark a workout complete. | Write | `plaivra.workouts.write` | Session status, duration and optional note | O1; raw note removed from output | No server confirm | low |
| `skip_workout` | Mark a workout skipped. | Write | `plaivra.workouts.write` | Schedule/session status and optional reason | O1; raw reason may be minimized as text | No server confirm | low |

## Progress and personal records

| Tool | Description | Action | Required scope(s) | User data touched | Output note | Confirm? | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `get_personal_records` | Return personal records, optionally filtered by exercise. | Read | `plaivra.progress.read` | Exercise records, weight/reps and dates | O1 | No | read |
| `add_personal_record` | Save a personal record and compare it with previous records. | Write | `plaivra.progress.write` | Exercise, record type, weight, reps, date and optional note | O1; raw note removed from output | No server confirm | low |
| `add_weight_entry` | Save body-weight progress. | Write | `plaivra.progress.write` | Weight, date and optional note | O1; weight is task-relevant; raw note removed | No server confirm | low |
| `add_body_measurement` | Save user-provided measurements for fitness tracking, not diagnosis or treatment. | Write | `plaivra.progress.write` | Waist, hips, chest, neck, shoulders, limbs, glutes, calves and date | O1; measurements are task-relevant sensitive data | No server confirm | low |
| `get_progress_summary` | Return progress entries, workout adherence, and aggregate food-log macros for a period. | Read | **All required:** `plaivra.progress.read`, `plaivra.workouts.read`, `plaivra.nutrition.read` | Progress entries, user workout sessions, and aggregate macros calculated from food logs | O1; no progress photos or raw food-log rows are returned | No | read |

## Profile goals and settings

| Tool | Description | Action | Required scope(s) | User data touched | Output note | Confirm? | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `update_user_profile` | Update profile fields such as height, age, gender, activity/training level, goal, and body goal. | Write | `plaivra.profile.write` | Account profile and fitness attributes | O1; sensitive profile values remain only when task-relevant | No server confirm | medium |
| `update_calorie_target` | Update calorie and macro targets. | Write | `plaivra.settings.write` | Daily calorie, protein, carbohydrate, fat and water targets | O1 | No server confirm | medium |
| `update_training_goal` | Update training goal, level, and activity level. | Write | `plaivra.profile.write` | Profile fitness goals/levels | O1 | No server confirm | medium |
| `update_water_target` | Update the daily water target. | Write | `plaivra.settings.write` | Hydration target setting | O1 | No server confirm | medium |
| `update_body_goal` | Update body goal and target weight. | Write | `plaivra.profile.write` | Body goal and target weight | O1; target is task-relevant sensitive data | No server confirm | medium |

No registered tool currently requires `plaivra.settings.read` because there is no standalone settings-read tool. The scope remains part of the saved permission model for future explicitly mapped tools; an unmapped future tool fails closed.

## Wellness, habits, sleep/recovery, and supplements

| Tool | Description | Action | Required scope(s) | User data touched | Output note | Confirm? | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `get_daily_fit_tasks` | Return fitness tasks for a date. | Read | `plaivra.wellness.read` | Task titles/status for the selected date | O1 | No | read |
| `create_daily_fit_task` | Create a user-owned fitness task for a date. | Write | `plaivra.wellness.write` | Task title, date and optional note | O1; raw note removed from output | No server confirm | low |
| `mark_daily_fit_task_done` | Mark a task completed. | Write | `plaivra.wellness.write` | Task completion state | O1 | No server confirm | low |
| `mark_daily_fit_task_skipped` | Mark a task skipped with an optional reason. | Write | `plaivra.wellness.write` | Task status and reason | O1 | No server confirm | low |
| `get_habits` | Return habits for a date. | Read | `plaivra.wellness.read` | Habit names/schedule/completion | O1 | No | read |
| `mark_habit_done` | Mark a habit done by ID or name. | Write | `plaivra.wellness.write` | Habit completion state/date | O1 | No server confirm | low |
| `create_habit` | Create a fitness or wellness tracking habit. | Write | `plaivra.wellness.write` | Habit name, schedule and optional note | O1; raw note removed from output | No server confirm | low |
| `add_sleep_recovery_log` | Track sleep/recovery and return general non-medical guidance. | Write | `plaivra.wellness.write` | Sleep hours/quality, recovery, fatigue, soreness, stress and optional note | O1; sensitive values are task-relevant; raw note removed | No server confirm | low |
| `get_sleep_recovery_summary` | Return recovery logs for a period. | Read | `plaivra.wellness.read` | Sleep/recovery tracking values | O1; non-medical use only | No | read |
| `get_today_supplements` | Return supplement logs. | Read | `plaivra.wellness.read` | User-entered supplement names/doses/timing/status | O1; tracking only | No | read |
| `add_supplement_log` | Track user-provided supplement data without dosage advice. | Write | `plaivra.wellness.write` | Supplement name, user-provided dose, time, reminder and date | O1; no recommendation is generated by Plaivra | No server confirm | low |
| `mark_supplement_taken` | Mark a supplement as taken. | Write | `plaivra.wellness.write` | Supplement tracking status/date | O1 | No server confirm | low |

## Admin and compatibility definitions

These five definitions are not part of normal public-user Full Access. `resolveSavedAiPermissionScopes` excludes admin access, and OAuth scope filtering rejects `plaivra.admin`. Do not include these as public app capabilities.

| Tool | Description | Action | Required scope(s) | User data touched | Output note | Confirm? | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `admin_api_status` | Internal provider-status view. | Admin read | `plaivra.admin` plus Plaivra admin role | Provider configuration/status, not member fitness records | O4 | N/A | admin |
| `admin_search_users` | Internal admin-only user search. | Admin read | `plaivra.admin` plus Plaivra admin role | User directory search results | O4; public OAuth cannot reach it | N/A | admin |
| `get_admin_user_summary` | Deprecated compatibility tool; disabled. | Disabled read-only | `plaivra.admin` plus Plaivra admin role | None; does not read member data | O5 | N/A | admin |
| `admin_create_global_food` | Deprecated compatibility tool; disabled. | Disabled read-only | `plaivra.admin` plus Plaivra admin role | None; does not create global food data | O5 | N/A | admin |
| `admin_create_global_workout_or_exercise` | Deprecated compatibility tool; disabled. | Disabled read-only | `plaivra.admin` plus Plaivra admin role | None; does not create global exercise data | O5 | N/A | admin |

## Scope summary

| Permission group | Read scope | Write scope | Notes |
| --- | --- | --- | --- |
| Workouts | `plaivra.workouts.read` | `plaivra.workouts.write` | Write implies workouts read only. |
| Nutrition | `plaivra.nutrition.read` | `plaivra.nutrition.write` | Meal-plan and hydration access are separate. |
| Meal plans | `plaivra.meal_plans.read` | `plaivra.meal_plans.write` | Does not imply food-log access. |
| Hydration | `plaivra.hydration.read` | `plaivra.hydration.write` | Does not imply nutrition access. |
| Progress | `plaivra.progress.read` | `plaivra.progress.write` | Covers records, weight, measurements, and summaries; not photos through MCP. |
| Wellness | `plaivra.wellness.read` | `plaivra.wellness.write` | Tasks, habits, sleep/recovery, and supplement tracking. |
| Profile | `plaivra.profile.read` | `plaivra.profile.write` | Identity/profile and goals. |
| Settings | `plaivra.settings.read` | `plaivra.settings.write` | Current registered writes cover calorie/macro and water targets. |
| Full Access | `plaivra.full_access` | Same marker expands to all normal read/write scopes | Explicitly saved; never includes admin. |
| Admin | `plaivra.admin` | Internal only | Not grantable through normal saved AI Permissions/OAuth. |

## OAuth tool metadata

The MCP `tools/list` payload includes `name`, `title`, `description`, `inputSchema`, MCP annotations, and one per-tool OAuth `securitySchemes` declaration derived from this mapping. The declaration omits legacy `plaivra.all`; `get_today_summary` declares only canonical `plaivra.full_access`. Admin schemes can appear only in a separately authorized internal admin catalog because normal public OAuth cannot grant or list admin tools.

Unauthenticated `tools/list` requests retain the HTTP `401` plus `WWW-Authenticate` protected-resource discovery challenge. Tool-call authentication and insufficient-scope failures return an MCP error result with `_meta["mcp/www_authenticate"]`, including an error, safe description, and canonical required scopes where applicable.
