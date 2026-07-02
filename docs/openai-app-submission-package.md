# Plaivra OpenAI App Submission Package

Internal review package only. This document does not represent an OpenAI submission, approval, certification, or endorsement.

- Prepared: 2026-07-02
- Repository starting commit: `63a5b978a15e4f3f60217697a90a5c9043dbff54`
- Intended publisher: Ahmed Mohamed, verified as an individual
- Current repository default production base URL: `https://plaivra.vercel.app` (verify the Vercel environment and deployed commit before submission)
- Detailed tool inventory: [openai-app-scope-mapping.md](./openai-app-scope-mapping.md)
- Reviewer scenarios: [openai-app-test-prompts.md](./openai-app-test-prompts.md)
- Manual gate: [openai-app-review-checklist.md](./openai-app-review-checklist.md)

## 1. Submission identity

| Field | Submission value |
| --- | --- |
| App name | Plaivra |
| Category | Fitness, nutrition, and wellness planning support |
| Operator/publisher | Ahmed Mohamed, individual operator |
| Support contact | [Ahmed.Mohamed04@outlook.de](mailto:Ahmed.Mohamed04@outlook.de) |
| Homepage | `https://plaivra.vercel.app/` - verify before submission |
| Privacy policy | `https://plaivra.vercel.app/legal/privacy` - verify before submission |
| Terms | `https://plaivra.vercel.app/legal/terms` - verify before submission |
| Impressum | `https://plaivra.vercel.app/legal/impressum` - verify before submission |
| Disclaimer | `https://plaivra.vercel.app/legal/disclaimer` - verify before submission |
| MCP server | `https://plaivra.vercel.app/api/mcp` - verify before submission |

Suggested short description:

> Connect your Plaivra account to ChatGPT to review and manage your authorized workout, meal-planning, nutrition, hydration, progress, and wellness tracking data.

Suggested reviewer-facing description:

> Plaivra is a personal fitness, nutrition, and wellness organizer. After the user signs in, saves AI Permissions, and explicitly authorizes the connection, ChatGPT can use Plaivra's MCP tools to read or update only the selected areas of that user's account. Plaivra is not a medical service. It does not diagnose, treat, prescribe, or provide clinical nutrition advice. Users must review AI-generated workout and meal content before saving or using it.

Do not describe Plaivra as approved, certified, endorsed, or reviewed by OpenAI unless and until OpenAI supplies that status.

## 2. Public routes and endpoints

These routes were found in the repository. The `plaivra.vercel.app` base is the fallback in `lib/env.ts`, not proof that every production environment variable points to it. HTTP checks on 2026-07-02 returned `200` for the homepage, login, register, four legal pages, both metadata endpoints, and the ChatGPT setup page. An unauthenticated MCP request correctly returned `401` with a protected-resource discovery challenge.

| Purpose | Actual implemented route | Expected production URL |
| --- | --- | --- |
| Homepage | `/` | `https://plaivra.vercel.app/` |
| Login | `/login` | `https://plaivra.vercel.app/login` |
| Register | `/register` | `https://plaivra.vercel.app/register` |
| Privacy policy | `/legal/privacy` | `https://plaivra.vercel.app/legal/privacy` |
| Terms | `/legal/terms` | `https://plaivra.vercel.app/legal/terms` |
| Impressum | `/legal/impressum` | `https://plaivra.vercel.app/legal/impressum` |
| Disclaimer | `/legal/disclaimer` | `https://plaivra.vercel.app/legal/disclaimer` |
| OAuth authorization-server metadata | `/.well-known/oauth-authorization-server` | `https://plaivra.vercel.app/.well-known/oauth-authorization-server` |
| OAuth protected-resource metadata | `/.well-known/oauth-protected-resource` | `https://plaivra.vercel.app/.well-known/oauth-protected-resource` |
| OAuth authorization endpoint | `/api/oauth/authorize` | `https://plaivra.vercel.app/api/oauth/authorize` |
| OAuth consent UI | `/oauth/authorize` | Internal browser handoff; not the protocol authorization endpoint |
| OAuth token endpoint | `/api/oauth/token` | `https://plaivra.vercel.app/api/oauth/token` |
| MCP endpoint | `/api/mcp` | `https://plaivra.vercel.app/api/mcp` |
| ChatGPT connection setup | `/settings/ai-imports/chatgpt-setup` | `https://plaivra.vercel.app/settings/ai-imports/chatgpt-setup` |
| Connection create/list/revoke | `/api/mcp/connections` | Signed-in Plaivra UI API; not an OpenAI submission URL |
| Redacted connection activity | `/api/mcp/activity` | Signed-in Plaivra UI API; not an OpenAI submission URL |

The repository also implements `POST /api/oauth/register`, but it intentionally returns `404` and states that dynamic client registration is unsupported. It is not advertised in OAuth metadata and must not be presented as DCR.

Protected-resource metadata now uses `https://plaivra.vercel.app/legal/privacy` as `resource_documentation`. This existing public page describes Plaivra's ChatGPT, MCP, OAuth, permission, revocation, and data-handling model and returned `200` on 2026-07-02. The old `https://plaivra.vercel.app/docs/chatgpt-mcp` target returned `404` and is no longer generated by the local implementation. Recheck the metadata after the next approved deployment.

## 3. OAuth account linking

Plaivra implements a custom OAuth authorization-code flow for a predefined, user-specific public client:

- Each active ChatGPT connection uses its UUID as the canonical `client_id`. It has no client secret.
- OAuth metadata advertises `authorization_code`, token endpoint authentication method `none`, and only PKCE `S256`.
- The authorization endpoint requires a code challenge and rejects methods other than `S256`.
- ChatGPT redirect URIs must use HTTPS, the `chatgpt.com` host, and the exact `/connector/oauth/{callback_id}` path pattern. A production allowlist may narrow this further through `PLAIVRA_CHATGPT_REDIRECT_URIS`.
- Authorization codes use the `plaivra_ac_...` prefix, expire after five minutes, are stored as HMAC-SHA256 hashes, and are atomically marked used before exchange. Replays fail.
- Access tokens use the `plaivra_mcp_at_...` prefix, expire after seven days, and are stored only as HMAC-SHA256 hashes.
- Authorization codes and access tokens are bound to the canonical MCP resource. The authorize, token, and MCP request paths reject a mismatched resource.
- The token's scopes are intersected with the user's currently saved AI Permissions on every authenticated MCP request. Missing, empty, changed, or stale permission settings fail closed.
- Inactive or revoked connections and expired tokens fail authentication.
- Legacy `plaivra_mcp_...` connection secrets are rejected as MCP bearer tokens. Legacy client-ID compatibility exists only behind `PLAIVRA_ALLOW_LEGACY_MCP_CLIENT_ID=true` and is disabled by default.
- Users can revoke active ChatGPT connections from Plaivra settings. Revocation also updates the recorded ChatGPT connection consent.
- Connection creation is blocked until the user has saved non-empty AI Permissions.

Plaivra does not implement or claim Client ID Metadata Documents (CIMD) or dynamic client registration (DCR). Current OpenAI documentation permits a predefined OAuth client model in addition to CIMD and DCR, but the exact public-submission configuration must be tested in the current Platform Dashboard.

## 4. AI Permissions model

User-facing explanation suitable for review:

> AI access is off until you review and save AI Permissions. Full AI Access enables the normal Plaivra read and write areas shown on the consent screen; it does not grant administrator access. Custom AI Access lets you choose individual areas and whether ChatGPT may only read or may create and update data. Write access implies read access only within the same area. You can change permissions or revoke the connection at any time. Missing permissions, an expired token, or a revoked connection stops access.

Implementation details:

- Default permissions are an empty array. No MCP permission is implicit.
- Full Access expands only to the 16 normal user scopes across workouts, nutrition, meal plans, hydration, progress, wellness, profile, and settings.
- Custom Access accepts only the chosen normal user section scopes. `plaivra.full_access`, `plaivra.all`, and `plaivra.admin` are rejected in custom mode.
- A write scope implies read only in its own section; it never crosses into another section.
- The consent UI lists requested groups, read/write capability, and sensitive fitness-data labels.
- High-risk tools are annotated destructive and require server-validated `confirm:true` after explicit user confirmation.
- Other create/update tools are marked as writes but do not use the server-side `confirm:true` field. Reviewer tests should verify ChatGPT's normal write confirmation behavior.
- Tool calls and authorization denials are recorded as redacted audit/activity summaries. Raw prompts, tokens, authorization codes, notes, body measurements, and similar sensitive values are excluded.
- Each visible MCP tool declares an OAuth `securitySchemes` entry derived from its canonical required scopes. Legacy `plaivra.all` is not included in tool declarations.
- Unauthenticated tool calls and insufficient-scope results carry `_meta["mcp/www_authenticate"]`; unauthenticated catalog discovery retains the HTTP `401` and `WWW-Authenticate` header.

## 5. MCP tool and scope model

The source registry contains 80 tools:

- 22 read tools
- 21 low-risk write tools
- 24 medium-risk write tools
- 8 high-risk/destructive tools
- 5 admin/internal tools

Normal user categories are profile/account context, food and nutrition, meal plans, hydration, workout plans and sessions, progress and personal records, settings/targets, and wellness tracking (tasks, habits, sleep/recovery, and supplements).

All 80 definitions, exact required scopes, data categories, output controls, confirmation behavior, and risk levels are documented in [openai-app-scope-mapping.md](./openai-app-scope-mapping.md). Five admin/internal definitions are outside the normal OAuth grant; three are disabled compatibility tools. They must not be presented as public app capabilities.

## 6. What ChatGPT can and cannot access

After authorization, ChatGPT can access:

- only the Plaivra account bound to the authorized connection;
- only tool categories within the user's saved AI Permissions and the access token's scopes;
- only the fields required for the requested tool response after output sanitization;
- user-entered fitness, nutrition, hydration, progress, or wellness data when the corresponding scope permits it; and
- selected public/reference food or exercise information where a tool explicitly uses it.

Plaivra strips internal ownership and connection identifiers, raw notes, timestamps used only as internal metadata, tokens, secrets, authorization codes, passwords, and service-role material from MCP results. Arrays are capped at 100 items, strings at 4,000 characters, and nested output depth at 10. Activity views use a separate allowlisted summary and never display raw prompts or sensitive request values.

ChatGPT cannot:

- access another user's Plaivra data;
- act without a valid OAuth access token and active user-owned connection;
- act after connection revocation or token expiry;
- broaden access beyond saved AI Permissions;
- use legacy connection secrets as bearer tokens;
- obtain raw OAuth tokens, token hashes, authorization codes, service-role secrets, or database credentials from tools;
- override server-controlled identity fields such as `user_id`, `owner_id`, `profile_id`, or `tenant_id`;
- complete a destructive tool without `confirm:true` after explicit confirmation; or
- use Plaivra for medical diagnosis, treatment, prescription, emergency care, or clinical nutrition advice.

## 7. Privacy, legal, and fitness-safety position

Plaivra is operated by Ahmed Mohamed as an individual. The repository contains public privacy, terms, impressum, and disclaimer pages in German with English summaries or sections. The texts identify the individual operator and do not invent a company, legal department, DPO, VAT ID, commercial register, employees, or phone number.

Plaivra is a fitness and planning organizer, not a medical service, healthcare provider, medical device, or emergency service. It does not diagnose, treat, prescribe, or provide clinical nutrition advice. AI-generated workout and meal content may be wrong or unsuitable and must be reviewed by the user. Users with medical conditions, injuries, pregnancy, eating disorders, allergies or intolerances, medication or supplement questions, or clinical nutrition needs should consult qualified professionals.

OpenAI's current submission guidelines prohibit processing protected health information (PHI) and impose conditions on regulated sensitive/special-category data. Plaivra tools are not intended to solicit PHI and their descriptions frame body, sleep, recovery, and supplement features as non-medical tracking. Before submission, counsel/privacy review must confirm the data classification, consent language, necessity, and disclosures for body measurements, weight, wellness, sleep/recovery, supplement data, and free-text fields. The reviewer account and test prompts must not contain PHI.

## 8. Security controls

Repository-supported controls include:

- Supabase RLS and owner-scoped storage/database policies.
- Server-side owner filtering on MCP reads and writes, including parent ownership checks before related-record access.
- Service-role use only in backend code, with the authenticated connection's user ID reapplied to every data operation.
- OAuth authorization-code flow with mandatory PKCE S256.
- HMAC-SHA256 storage of authorization codes and access tokens.
- Five-minute, single-use authorization codes and seven-day access-token expiry.
- Exact redirect, client, resource, scope, active-connection, and current-permission checks.
- Connection and consent revocation.
- Database-backed MCP rate limits with an in-memory fallback, plus authorization/token/connection-creation limits.
- Server-side schema validation, type/range/length limits, UUID/date checks, rejection of undeclared fields, and rejection of caller-supplied identity fields.
- Redacted audit logs and minimized MCP output.
- Explicit confirmation for all eight high-risk/destructive tools.
- Per-tool OAuth security declarations plus safe MCP reauthorization challenges for missing/invalid authentication and insufficient scope.
- HTTP CSP, HSTS in production, clickjacking, MIME, referrer, and permissions-policy headers.
- A private `progress-photos` bucket, owner-prefixed object paths, signed URLs, MIME/size checks, and owner-scoped policies.
- Server-side admin API authentication and role checks.
- Automated coverage for two-user isolation, cross-scope denial, stale/missing permissions, revoked/expired credentials, replay, resource binding, redaction, destructive confirmation, admin denial, privacy-route ownership, and progress-photo paths.
- `npm audit --audit-level=high` passed on 2026-07-02 with no high or critical findings; three moderate findings remain and should be tracked.

Do not describe these controls as a security guarantee or certification. The OAuth rate-limit helper currently fails open if its backing database rate-limit RPC errors; monitoring that dependency remains advisable.

## 9. Current official OpenAI documentation alignment

Official documentation was checked on 2026-07-02:

- [Submit and maintain your app](https://developers.openai.com/apps-sdk/deploy/submission)
- [App submission guidelines](https://developers.openai.com/apps-sdk/app-submission-guidelines)
- [Authentication](https://developers.openai.com/apps-sdk/build/auth)
- [Security and privacy](https://developers.openai.com/apps-sdk/guides/security-privacy)
- [Define tools](https://developers.openai.com/apps-sdk/plan/tools)
- [Test your integration](https://developers.openai.com/apps-sdk/deploy/testing)

Current submission items that must be handled outside the repository:

- Complete OpenAI identity verification as Ahmed Mohamed, an individual. Do not use an unverified business name.
- Confirm the submitting OpenAI project has `api.apps.write` and `api.apps.read` permissions as needed.
- Confirm the submitting OpenAI project is eligible for app review. Current documentation says projects with EU data residency cannot submit.
- Use the real, public production MCP URL; never submit a placeholder or local/test URL.
- Prepare the name, logo, description, homepage/company field as applicable, privacy policy URL, MCP/tool information, screenshots, test prompts with expected responses, and localization information required by the current form.
- Confirm the app is appropriate for a general audience including ages 13-17 and is not targeted to children under 13.
- Recheck every requirement immediately before submission because the review flow and policies can change.

Phase 9 cleanup completed in the working tree:

1. The local migration was renamed from `20260702124500` to the already-applied remote version `20260702124724`. `npx supabase migration list` is aligned through `20260702124724`; no migration was applied.
2. Protected-resource `resource_documentation` now points to the existing public `/legal/privacy` page instead of the old `404` URL.
3. Tool descriptors now declare per-tool OAuth `securitySchemes`, and tool-call auth failures include `_meta["mcp/www_authenticate"]`. Unauthenticated `tools/list` continues to use the standards-compatible HTTP `401` discovery challenge.
4. Public authorization-server and protected-resource metadata use a public-only scope list that excludes `plaivra.admin` and legacy `plaivra.all`. Internal constants remain available for fail-closed compatibility and admin checks.
5. `get_progress_summary` reads progress entries, user workout sessions, and food logs for aggregate macros. It now requires `plaivra.progress.read`, `plaivra.workouts.read`, and `plaivra.nutrition.read` together; a Progress-only connection cannot list or call it.

Remaining implementation/deployment validation before submission:

1. Deploy the reviewed cleanup and verify both live metadata documents, the new resource-documentation URL, tool `securitySchemes`, and both auth challenge paths.
2. The site has an HTTP Content-Security-Policy. Confirm whether the submission expects an Apps SDK resource CSP (`_meta.ui.csp`) even though Plaivra currently exposes tool-only MCP behavior and no ChatGPT widget resource.
3. Complete the sensitive-data/PHI classification and disclosure review described above.

## 10. Reviewer account and evidence package

Prepare a dedicated, non-production reviewer account containing synthetic data only:

- one active beginner workout plan with at least two days and several exercises;
- one prior workout session and one personal record;
- one day of food logs plus a small meal plan;
- today's hydration data;
- synthetic weight/body-measurement history;
- a habit, task, sleep/recovery entry, and supplement tracking entry;
- Full Access and Custom Access screenshots;
- consent, connection success, redacted activity, and revoke screenshots; and
- before/after evidence for representative read, write, and destructive-confirmation tests.

Never place real medical records, credentials, private production data, or another user's data in reviewer materials.

## 11. Remaining risks that are not claims of approval

- Final German legal/privacy review remains recommended and may be required before public launch.
- Retention periods, processor agreements, international-transfer safeguards, and deletion operations still need final legal and operational sign-off.
- Production monitoring, alerting, and rate-limit dependency visibility may need improvement.
- OpenAI may require CIMD, DCR, different OAuth metadata, per-tool auth declarations, an Apps SDK UI/CSP, or other submission-specific changes.
- OpenAI may reject or request changes to fitness/body/wellness data handling even when it is non-medical.
- Plaivra is not yet approved by OpenAI and must not be marketed as approved or endorsed.
- Plaivra must not be marketed as medical advice or a substitute for qualified care.

## Submission recommendation

The internal package is ready for review, but Plaivra is **not ready for actual OpenAI submission yet**. Complete every remaining blocking item in [openai-app-review-checklist.md](./openai-app-review-checklist.md), especially approved production deployment/verification, sensitive-data review, reviewer evidence, and OpenAI individual/project eligibility checks.
