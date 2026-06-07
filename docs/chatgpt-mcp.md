# FitLife ChatGPT MCP Connector

## What this does

This feature lets a FitLife user connect their FitLife account to ChatGPT once, then use ChatGPT itself to log and manage FitLife data through controlled MCP tools.

Example ChatGPT messages:

- "I ate 2 boiled eggs for breakfast today."
- "I drank 750ml water."
- "I benched 80kg for 6 reps."
- "Create a 4-day muscle gain workout plan."

ChatGPT calls the FitLife MCP endpoint. FitLife authenticates the linked connection, maps it to the correct Supabase user, validates typed tool input, writes only through safe server-side actions, and stores the result in Supabase.

## What this does not do

- It does not add an in-app chatbot.
- It does not use Gemini.
- It does not require `GEMINI_API_KEY`.
- It does not require `OPENAI_API_KEY`.
- It does not let ChatGPT run SQL.
- It does not expose Supabase service-role keys to the browser.

FitLife remains the real account identity. ChatGPT is only an external client after the user explicitly links FitLife.

## Added architecture

```text
app/api/mcp/route.ts
app/api/chatgpt-connection/route.ts
app/.well-known/oauth-protected-resource/route.ts
lib/mcp/auth.ts
lib/mcp/server.ts
lib/mcp/tools.ts
lib/mcp/tool-executor.ts
lib/mcp/schemas.ts
lib/server/supabase-admin.ts
supabase/migrations/014_chatgpt_mcp_connections.sql
components/settings/connected-apps.tsx
```

## Current account-linking mode

This implementation uses secure token linking as the development foundation:

1. User logs in to FitLife.
2. User opens Settings > Connected Apps.
3. User creates a ChatGPT connection.
4. FitLife shows a one-time token.
5. User configures ChatGPT/MCP with:
   - MCP URL: `https://your-domain.com/api/mcp`
   - Authorization: `Bearer <one-time-token>`
6. FitLife stores only the token hash.
7. User can revoke access anytime.

## Production OAuth upgrade path

The code already separates the resource server, protected-resource metadata, user mapping, and tool execution. To replace token mode with full production OAuth:

1. Add an OAuth authorization server or identity provider.
2. Publish authorization-server metadata.
3. Support PKCE and the `resource` parameter.
4. Issue access tokens scoped to the linked FitLife user.
5. Replace the token-hash lookup in `lib/mcp/auth.ts` with issuer token validation.
6. Keep the same MCP tool schemas and server-side FitLife actions.

## Required environment variables

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=https://your-vercel-domain.vercel.app

FITLIFE_MCP_BASE_URL=https://your-vercel-domain.vercel.app/api/mcp
FITLIFE_MCP_TOKEN_SECRET=replace-with-a-long-random-secret
FITLIFE_MCP_OAUTH_CLIENT_ID=
FITLIFE_MCP_OAUTH_CLIENT_SECRET=
FITLIFE_MCP_ALLOWED_ORIGINS=https://chatgpt.com,https://chat.openai.com
```

Use a long random value for `FITLIFE_MCP_TOKEN_SECRET`. Do not expose it in frontend code.

## Supabase setup

Run:

```sql
supabase/migrations/014_chatgpt_mcp_connections.sql
```

This creates:

- `chatgpt_connections`
- `mcp_audit_logs`

Security behavior:

- tokens are hashed with HMAC-SHA256
- plaintext token is shown only once
- users can view/revoke only their own connections
- MCP execution uses service role only on the server
- every action manually scopes data to the authenticated FitLife user

## MCP tools

Tool groups:

- Account/context: `get_fitlife_status`, `get_user_profile`, `get_today_summary`
- Food/calories: `search_foods`, `add_food_log`, `create_custom_food`, `create_custom_meal`, `get_today_calories`, `delete_food_log`
- Meal plan: `get_meal_plan`, `create_meal_plan_item`, `create_day_meal_plan`, `create_week_meal_plan`, `replace_meal_plan_item`, `mark_meal_plan_item_done`, `generate_shopping_list`
- Hydration: `add_water_log`, `get_water_summary`, `delete_water_log`
- Workout plan: `search_exercises`, `get_active_workout_plan`, `generate_workout_plan`, `edit_workout_plan`, `replace_exercise`, `add_cardio_to_plan`, `activate_workout_plan`
- Workout logging: `get_today_workout`, `start_workout`, `log_exercise_sets`, `complete_workout`, `skip_workout`
- PRs: `get_personal_records`, `add_personal_record`
- Progress: `add_weight_entry`, `add_body_measurement`, `get_progress_summary`
- Tasks/habits: `get_daily_fit_tasks`, `create_daily_fit_task`, `mark_daily_fit_task_done`, `mark_daily_fit_task_skipped`, `get_habits`, `mark_habit_done`, `create_habit`
- Sleep/recovery: `add_sleep_recovery_log`, `get_sleep_recovery_summary`
- Supplements: `get_today_supplements`, `add_supplement_log`, `mark_supplement_taken`
- Admin-only: `get_admin_user_summary`, `admin_search_users`, `admin_create_global_food`, `admin_create_global_workout_or_exercise`, `admin_api_status`

## Safety behavior

Low-risk writes execute after normal MCP write confirmation.

Medium-risk tools return a preview when appropriate.

High-risk tools require `confirm: true`:

- delete logs
- activate active workout plan
- destructive workout edits

Admin tools require `profile.role = admin`.

Supplement tools are tracking-only. Sleep/recovery tools return general fitness guidance only, not medical advice.

## Manual local test

```bash
npm run lint
npm run typecheck
npm run build
```

```bash
curl -X POST "http://localhost:3000/api/mcp" \
  -H "Authorization: Bearer fitlife_mcp_your_token" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

```bash
curl -X POST "http://localhost:3000/api/mcp" \
  -H "Authorization: Bearer fitlife_mcp_your_token" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"add_water_log","arguments":{"amount_ml":750,"date":"today"}}}'
```

## Troubleshooting

- `401`: token missing, invalid, or revoked.
- `503`: `SUPABASE_SERVICE_ROLE_KEY` or `FITLIFE_MCP_TOKEN_SECRET` missing.
- `ambiguous_food_match`: call `search_foods` and ask user to choose.
- `not_admin`: linked FitLife profile is not admin.
- `target_record_not_found`: record does not belong to linked user or does not exist.
- `requires_confirmation`: ask the user for explicit confirmation, then call again with `confirm: true`.
