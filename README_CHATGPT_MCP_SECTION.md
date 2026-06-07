## ChatGPT External Connector / MCP Server

FitLife includes a secure external MCP connector so ChatGPT can call controlled FitLife tools after a user links their FitLife account.

This is not an in-app chatbot.

ChatGPT flow:

```text
User opens ChatGPT
↓
User connects FitLife once
↓
User writes naturally in ChatGPT
↓
ChatGPT calls FitLife MCP tools
↓
FitLife validates the linked user
↓
FitLife saves structured data in Supabase
↓
User opens FitLife and sees the update
```

Supported areas:

- meals and calories
- water
- meal plans
- workout plans
- workout logs
- personal records
- weight/progress
- habits
- daily tasks
- sleep/recovery
- supplements
- admin-only user summaries and global food/workout creation

Important:

- No Gemini is used.
- No `GEMINI_API_KEY` is needed.
- No `OPENAI_API_KEY` is needed for this feature.
- FitLife does not call OpenAI for this connector.
- ChatGPT calls FitLife through `/api/mcp`.
- ChatGPT never receives Supabase service-role keys.
- ChatGPT never writes raw SQL.
- All MCP writes are typed, validated, audited, and scoped to the linked FitLife user.

Documentation: `docs/chatgpt-mcp.md`
