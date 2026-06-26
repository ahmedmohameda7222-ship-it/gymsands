## ChatGPT External Connector / MCP Server

Plaivra includes a secure external MCP connector so ChatGPT can call controlled Plaivra tools after a user links their Plaivra account.

This is not an in-app chatbot.

ChatGPT flow:

```text
User opens ChatGPT
↓
User connects Plaivra once
↓
User writes naturally in ChatGPT
↓
ChatGPT calls Plaivra MCP tools
↓
Plaivra validates the linked user
↓
Plaivra saves structured data in Supabase
↓
User opens Plaivra and sees the update
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
- Plaivra does not call OpenAI for this connector.
- ChatGPT calls Plaivra through `/api/mcp`.
- ChatGPT never receives Supabase service-role keys.
- ChatGPT never writes raw SQL.
- All MCP writes are typed, validated, audited, and scoped to the linked Plaivra user.

Documentation: `docs/chatgpt-mcp.md`
