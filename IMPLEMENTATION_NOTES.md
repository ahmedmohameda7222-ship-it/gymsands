# FitLife ChatGPT MCP Implementation Notes

Direct GitHub writes were blocked by the connector safety layer, so this zip is a copy-ready implementation package.

## Copy into repo root

Copy all folders/files into `ahmedmohameda7222-ship-it/gymsands`, preserving paths.

Files that should replace existing files:

- `.env.example`
- `lib/integrations/env.ts`
- `components/settings/connected-apps.tsx`

Files to add:

- `app/api/mcp/route.ts`
- `app/api/chatgpt-connection/route.ts`
- `app/.well-known/oauth-protected-resource/route.ts`
- `lib/mcp/auth.ts`
- `lib/mcp/server.ts`
- `lib/mcp/tools.ts`
- `lib/mcp/tool-executor.ts`
- `lib/mcp/schemas.ts`
- `lib/server/supabase-admin.ts`
- `supabase/migrations/014_chatgpt_mcp_connections.sql`
- `docs/chatgpt-mcp.md`

Also merge `README_CHATGPT_MCP_SECTION.md` into your existing `README.md`.

## Run migration

Run this in Supabase SQL editor:

```text
supabase/migrations/014_chatgpt_mcp_connections.sql
```

## Set env vars

```env
SUPABASE_SERVICE_ROLE_KEY=
FITLIFE_MCP_BASE_URL=https://your-domain.com/api/mcp
FITLIFE_MCP_TOKEN_SECRET=long-random-secret
FITLIFE_MCP_ALLOWED_ORIGINS=https://chatgpt.com,https://chat.openai.com
```

Remove Gemini env vars from deployment settings if present:

```env
GEMINI_API_KEY
GEMINI_MODEL
```

## Validate

```bash
npm run lint
npm run typecheck
npm run build
```

## Notes

- `generate_workout_plan` is wired as a safe preview in the MCP executor because your app already has full persistence in `/api/workout-plan/generate`. For complete one-call generation from MCP, move that route's save logic into `lib/mcp/tool-executor.ts` or extract it to a shared server action.
- All non-admin tools derive `user_id` from the authenticated connection, never from model input.
- Admin tools check `profile.role === "admin"`.
