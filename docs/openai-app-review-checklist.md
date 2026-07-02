# Plaivra OpenAI App Review Checklist

Do not submit until every blocking item is checked with production evidence. Do not interpret this checklist as OpenAI approval.

## A. Repository and database state - blocking

- [x] `main` is clean, reviewed, and at the intended release commit. ([evidence](./openai-app-review-evidence.md#evidence-summary))
- [x] The production deployment is confirmed to contain that exact commit. ([evidence](./openai-app-review-evidence.md#evidence-summary))
- [x] `npx supabase migration list` is aligned locally and remotely through `20260702124724`.
- [x] The local migration was renamed from `20260702124500` to the already-applied remote version `20260702124724`; no migration was applied.
- [x] No migration or `supabase db push` is run merely to make the list look aligned; review the SQL and production history first. ([evidence](./openai-app-review-evidence.md#evidence-summary))
- [x] `npm.cmd run lint` passes. ([evidence](./openai-app-review-evidence.md#commands-and-results))
- [x] `npm.cmd run typecheck` passes. ([evidence](./openai-app-review-evidence.md#commands-and-results))
- [x] `npm.cmd test` passes. ([evidence](./openai-app-review-evidence.md#commands-and-results))
- [x] `npm.cmd run build` passes. ([evidence](./openai-app-review-evidence.md#commands-and-results))
- [x] `npm.cmd audit --audit-level=high` reports no high or critical vulnerabilities. ([evidence](./openai-app-review-evidence.md#commands-and-results))
- [x] `git diff --check` passes. ([evidence](./openai-app-review-evidence.md#commands-and-results))

## B. OpenAI publisher and project - blocking

- [ ] Ahmed Mohamed has completed OpenAI individual identity verification under the intended publisher name.
- [ ] No unverified company or legal entity is used in the listing.
- [ ] The submitting account/project has `api.apps.write`.
- [ ] The reviewing account/project has `api.apps.read` as needed.
- [ ] The OpenAI project is eligible for public app submission under the current documentation.
- [ ] The project is not blocked by the current EU data-residency submission restriction.
- [ ] The current [submission guide](https://developers.openai.com/apps-sdk/deploy/submission) and [app submission guidelines](https://developers.openai.com/apps-sdk/app-submission-guidelines) have been re-read immediately before submission.

## C. Production identity and public URLs - blocking

- [ ] `NEXT_PUBLIC_APP_URL` is confirmed as the intended production origin.
- [ ] `PLAIVRA_MCP_BASE_URL` is the exact canonical public MCP resource.
- [ ] The Vercel environment points to Supabase project `bkwezjxvapaeasfvlhvv`.
- [x] `https://plaivra.vercel.app/` is the intended final homepage, or every package URL is updated to the real production domain. ([evidence](./openai-app-review-evidence.md#production-url-evidence))
- [x] Homepage is live and presents Plaivra accurately. ([evidence](./openai-app-review-evidence.md#production-url-evidence))
- [x] `/login` works. ([evidence](./openai-app-review-evidence.md#production-url-evidence))
- [x] `/register` works. ([evidence](./openai-app-review-evidence.md#production-url-evidence))
- [x] `/legal/privacy` is public and current. ([evidence](./openai-app-review-evidence.md#production-url-evidence))
- [x] `/legal/terms` is public and current. ([evidence](./openai-app-review-evidence.md#production-url-evidence))
- [x] `/legal/impressum` is public and current. ([evidence](./openai-app-review-evidence.md#production-url-evidence))
- [x] `/legal/disclaimer` is public and current. ([evidence](./openai-app-review-evidence.md#production-url-evidence))
- [ ] Support email `Ahmed.Mohamed04@outlook.de` is monitored.
- [x] No page claims OpenAI approval, endorsement, certification, or public listing. ([evidence](./openai-app-review-evidence.md#checklist-evidence-table))

## D. OAuth discovery and account linking - blocking

- [x] `/.well-known/oauth-authorization-server` returns the intended issuer, authorize endpoint, token endpoint, public-client method `none`, and PKCE `S256`. ([evidence](./openai-app-review-evidence.md#metadata-checks))
- [x] `/.well-known/oauth-protected-resource` returns the exact canonical MCP resource. ([evidence](./openai-app-review-evidence.md#metadata-checks))
- [x] Local protected-resource metadata now uses the existing public `/legal/privacy` page for `resource_documentation`; the target currently returns `200`.
- [x] Verify deployed protected-resource metadata publishes the new `/legal/privacy` URL after the next approved deployment. ([evidence](./openai-app-review-evidence.md#metadata-checks))
- [x] Public metadata now advertises only publicly grantable scopes and excludes `plaivra.admin` and legacy `plaivra.all`.
- [x] Verify both deployed metadata documents exclude `plaivra.admin` and `plaivra.all` after the next approved deployment. ([evidence](./openai-app-review-evidence.md#metadata-checks))
- [x] `/api/oauth/authorize` works end to end with the current ChatGPT production callback. (User-confirmed; [evidence](./openai-app-review-evidence.md#oauthmcp-behavior-evidence))
- [x] `/api/oauth/token` exchanges a valid single-use code only once. ([evidence](./openai-app-review-evidence.md#oauthmcp-behavior-evidence))
- [x] `/api/oauth/register` remains unadvertised and no DCR/CIMD support is claimed. ([evidence](./openai-app-review-evidence.md#metadata-checks))
- [x] ChatGPT is configured as a predefined/user-defined public OAuth client with no client secret. (User-confirmed and code-reviewed; [evidence](./openai-app-review-evidence.md#metadata-checks))
- [ ] The production callback is present in `PLAIVRA_CHATGPT_REDIRECT_URIS` if that allowlist is configured.
- [x] Authorization without PKCE fails. ([evidence](./openai-app-review-evidence.md#oauthmcp-behavior-evidence))
- [x] PKCE methods other than `S256` fail. ([evidence](./openai-app-review-evidence.md#oauthmcp-behavior-evidence))
- [x] Wrong `client_id`, callback, code verifier, resource, or scope fails. ([evidence](./openai-app-review-evidence.md#oauthmcp-behavior-evidence))
- [x] Replayed and expired authorization codes fail. ([evidence](./openai-app-review-evidence.md#oauthmcp-behavior-evidence))
- [x] Expired access tokens fail. ([evidence](./openai-app-review-evidence.md#oauthmcp-behavior-evidence))
- [x] Revoked connections fail immediately. ([evidence](./openai-app-review-evidence.md#oauthmcp-behavior-evidence))
- [x] Legacy connection secrets fail as bearer tokens. ([evidence](./openai-app-review-evidence.md#oauthmcp-behavior-evidence))
- [x] Token and connection secrets never appear in browser UI, logs, exports, or tool output. ([evidence](./openai-app-review-evidence.md#oauthmcp-behavior-evidence))
- [x] Every locally visible tool declares one per-tool OAuth `securitySchemes` entry derived from its canonical required scopes.
- [x] Unauthenticated tool calls and insufficient-scope failures locally return `_meta["mcp/www_authenticate"]` with safe error details; unauthenticated `tools/list` retains HTTP `401` discovery.
- [ ] Test the final deployed `securitySchemes` and auth-challenge behavior in ChatGPT Developer Mode/MCP Inspector before submission.
- [ ] No `/api/mcp/connections` `500` or unexplained `403` occurs in the normal saved-permissions flow.
- [ ] No `/api/user/consents` unexplained `409` occurs in the normal flow.
- [ ] No onboarding `400` occurs in the normal flow, or the separate condition is clearly documented and does not block account linking.

## E. AI Permissions and revoke behavior - blocking

- [x] A new user has no AI access before saving permissions. ([evidence](./openai-app-review-evidence.md#ai-permissions-evidence))
- [x] Full Access saves exactly `plaivra.full_access` plus the 16 normal user scopes and never admin access. ([evidence](./openai-app-review-evidence.md#ai-permissions-evidence))
- [x] Full Access connection creation succeeds. (User-confirmed; [evidence](./openai-app-review-evidence.md#ai-permissions-evidence))
- [x] Custom Access saves only selected sections. ([evidence](./openai-app-review-evidence.md#ai-permissions-evidence))
- [x] Custom read-only access cannot write. ([evidence](./openai-app-review-evidence.md#ai-permissions-evidence))
- [x] A section write scope implies read only for that section. ([evidence](./openai-app-review-evidence.md#ai-permissions-evidence))
- [x] Cross-section access is denied. ([evidence](./openai-app-review-evidence.md#ai-permissions-evidence))
- [x] `get_progress_summary` requires all three relevant reads: Progress, Workouts, and Nutrition. Progress-only access fails closed.
- [x] Missing or empty permission settings fail closed. ([evidence](./openai-app-review-evidence.md#ai-permissions-evidence))
- [x] Changing saved permissions narrows effective access immediately. ([evidence](./openai-app-review-evidence.md#ai-permissions-evidence))
- [x] Reconnecting refreshes token scopes after permission changes. ([evidence](./openai-app-review-evidence.md#ai-permissions-evidence))
- [x] Consent UI accurately lists requested read/write groups and sensitive-data labels. ([evidence](./openai-app-review-evidence.md#ai-permissions-evidence))
- [ ] Revoke works from `/settings/ai-imports/chatgpt-setup`.
- [x] Revoke updates the user-facing connection status and consent record. ([evidence](./openai-app-review-evidence.md#ai-permissions-evidence))
- [x] Redacted activity shows allowed, denied, and failed events without raw prompts or sensitive values. ([evidence](./openai-app-review-evidence.md#ai-permissions-evidence))

## F. MCP catalog, safety, and reviewer behavior - blocking

- [ ] The production `tools/list` inventory matches [openai-app-scope-mapping.md](./openai-app-scope-mapping.md).
- [x] Only scope-authorized tools are listed for the current connection. ([evidence](./openai-app-review-evidence.md#checklist-evidence-table))
- [x] Admin/internal tools do not appear for a normal public user. ([evidence](./openai-app-review-evidence.md#checklist-evidence-table))
- [x] Deprecated compatibility tools are not described as public capabilities. ([evidence](./openai-app-review-evidence.md#checklist-evidence-table))
- [x] Every write tool is correctly annotated as non-read-only. ([evidence](./openai-app-review-evidence.md#checklist-evidence-table))
- [x] All eight high-risk tools have `destructiveHint: true` and reject missing `confirm:true`. ([evidence](./openai-app-review-evidence.md#checklist-evidence-table))
- [x] Tool descriptions are accurate, neutral, and do not manipulate model selection. ([evidence](./openai-app-review-evidence.md#checklist-evidence-table))
- [x] Inputs reject undeclared identity fields, invalid UUIDs/dates/enums, unsafe ranges, overlong strings, and oversized arrays. ([evidence](./openai-app-review-evidence.md#checklist-evidence-table))
- [x] Outputs contain only task-relevant data and no internal IDs, tokens, secrets, raw private notes, or unnecessary telemetry. ([evidence](./openai-app-review-evidence.md#checklist-evidence-table))
- [x] A User A token cannot read or modify User B data. ([evidence](./openai-app-review-evidence.md#checklist-evidence-table))
- [x] Attempts to pass User B object IDs return not-found/denied behavior without confirming the object's existence. ([evidence](./openai-app-review-evidence.md#checklist-evidence-table))
- [x] Prompt-injection text inside saved names/notes is treated as data, not instructions. ([evidence](./openai-app-review-evidence.md#checklist-evidence-table))
- [ ] Every scenario in [openai-app-test-prompts.md](./openai-app-test-prompts.md) is recorded with actual ChatGPT output and tool-call evidence.

## G. Privacy, sensitive data, and legal review - blocking

- [ ] Final German legal/privacy review is complete or the operator explicitly accepts the documented residual risk.
- [ ] OpenAI's prohibition on protected health information (PHI) has been reviewed against every tool schema and free-text field.
- [ ] The reviewer account contains synthetic fitness data only and no PHI.
- [ ] Body measurements, weight, sleep/recovery, wellness, and supplement data have a documented sensitive/special-category classification.
- [ ] Collection is necessary for the stated tool purpose, disclosed prominently, and supported by legally adequate consent where required.
- [ ] Privacy policy describes collected categories, purposes, recipient categories, retention, and user controls.
- [ ] OpenAI/ChatGPT data transfer and role language matches the actual product/contract context.
- [ ] Processor agreements and international-transfer safeguards are finalized where required.
- [ ] Final retention periods and deletion schedules are approved.
- [ ] Data export works and excludes raw OAuth/token/audit internals.
- [ ] Privacy-request creation and status viewing work only for the authenticated owner.
- [ ] Account deletion/revocation runbook is tested in the required order.
- [x] Medical limitations are clear without presenting Plaivra as a medical product. ([evidence](./openai-app-review-evidence.md#legal-privacy-and-sensitive-data-evidence))
- [x] Workout/meal prompts and listing copy avoid diagnosis, treatment, prescription, clinical nutrition, and outcome guarantees. ([evidence](./openai-app-review-evidence.md#legal-privacy-and-sensitive-data-evidence))
- [ ] The app is appropriate for a general audience including users aged 13-17 and does not target children under 13.

## H. Production security and operations - blocking

- [x] HTTPS and HSTS are active. ([evidence](./openai-app-review-evidence.md#production-url-evidence))
- [ ] HTTP CSP has no production errors for normal Plaivra flows.
- [ ] Confirm whether an Apps SDK resource CSP (`_meta.ui.csp`) is required for this tool-only integration; implement it if the submission validator requires it.
- [ ] Browser console and network panel are clean enough during registration, login, permission save, connect, consent, tool use, revoke, export, and privacy requests.
- [x] Progress photos remain in a private bucket and are never exposed to MCP tools. ([evidence](./openai-app-review-evidence.md#checklist-evidence-table))
- [x] Admin APIs reject unauthenticated and non-admin users server-side. ([evidence](./openai-app-review-evidence.md#checklist-evidence-table))
- [ ] MCP, OAuth, connection, consent, export, privacy, and admin failures are monitored without logging secrets or raw prompts.
- [ ] Database rate-limit RPCs are monitored; OAuth rate limiting currently fails open if its RPC errors.
- [ ] Production backup, incident response, and revocation procedures are documented.

## I. Submission assets and reviewer notes - blocking

- [x] Listing name is `Plaivra`. ([evidence](./openai-app-review-evidence.md#submission-assets-evidence))
- [x] Category is fitness/nutrition/wellness planning support. ([evidence](./openai-app-review-evidence.md#submission-assets-evidence))
- [x] Final short and long descriptions match the package and actual tool behavior. ([evidence](./openai-app-review-evidence.md#submission-assets-evidence))
- [ ] Existing logo `public/plaivra-logo.png` meets the current dashboard format and size requirements.
- [ ] Required screenshots are captured from the current production build.
- [ ] Screenshots include AI Permissions, OAuth consent, successful connection, representative tool result, redacted activity, and revoke.
- [ ] A dedicated reviewer account is ready with synthetic workouts, meals, hydration, progress, and wellness data.
- [ ] Reviewer login/setup instructions are complete and contain no production-user credentials in repository files.
- [x] MCP server and OAuth fields use real production values, not placeholders. ([evidence](./openai-app-review-evidence.md#submission-assets-evidence))
- [ ] Tool/scope information is copied from the exact production inventory.
- [x] Test prompts and representative expected responses are attached. ([evidence](./openai-app-review-evidence.md#submission-assets-evidence))
- [ ] Localization information is supplied as required by the current submission form.
- [ ] Company/homepage form fields identify Ahmed Mohamed as an individual and do not invent a company.
- [x] A final reviewer note says Plaivra is non-medical, permission-controlled, owner-scoped, and revocable. ([evidence](./openai-app-review-evidence.md#submission-assets-evidence))

## J. Final go/no-go

- [ ] All blocking items above are complete.
- [ ] Remaining risks are accepted and recorded.
- [ ] The final submission draft has been reviewed by Ahmed Mohamed.
- [ ] Explicit approval to submit has been given.
- [x] Submission has not been automated or performed from this checklist task. ([evidence](./openai-app-review-evidence.md#final-recommendation))

Decision: **NO-GO until all blocking items are checked.**
