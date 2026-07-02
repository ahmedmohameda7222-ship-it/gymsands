# Plaivra OpenAI App Review Evidence

This is an internal pre-submission record. It is not OpenAI approval, certification, endorsement, or authorization to submit.

## 1. Review metadata

| Field | Value |
| --- | --- |
| Review date | 2026-07-02 |
| Repository | `ahmedmohameda7222-ship-it/gymsands` |
| Branch | `main` |
| Reviewed commit | `d56fcb4a410e865b41a70119a7461e20de52a55e` |
| Production URL | `https://plaivra.vercel.app` |
| Supabase project | `bkwezjxvapaeasfvlhvv` |
| Review scope | Phase 9.5 final readiness review; no OpenAI submission, production database write, migration application, or `supabase db push` |

## 2. Evidence summary

- `git pull --ff-only origin main` reported that `main` was already current. The starting worktree was clean and local `main` matched `origin/main` at the reviewed commit.
- The commit-specific GitHub deployment status for `d56fcb4a410e865b41a70119a7461e20de52a55e` was `success`; its Vercel status said `Deployment has completed`.
- `npx.cmd supabase migration list` showed matching local and remote versions through `20260702124724`. The reviewed SQL file is `supabase/migrations/20260702124724_fix_chatgpt_connection_rotation_ambiguous_columns.sql`. No migration or database push was run.
- All requested public pages and metadata documents returned `200`. Unauthenticated MCP discovery returned `401` with a protected-resource `WWW-Authenticate` challenge rather than `404` or `500`.
- Production metadata advertises PKCE `S256`, public-client token authentication method `none`, the canonical MCP resource, and only publicly grantable scopes. It does not advertise `plaivra.admin`, `plaivra.all`, DCR, or CIMD.
- The repository test suite covers OAuth code/token binding, replay and expiry, current saved permissions, connection revocation, cross-scope denial, owner isolation, destructive confirmation, output sanitization, audit redaction, and admin-tool exclusion.
- The user stated that the post-deployment system is working. The Full Access ChatGPT connection is therefore recorded as **User-confirmed**, not independently reproduced during this review.
- Current official requirements were rechecked against the [submission guide](https://developers.openai.com/apps-sdk/deploy/submission), [submission guidelines](https://developers.openai.com/apps-sdk/app-submission-guidelines), [authentication guide](https://developers.openai.com/apps-sdk/build/auth), and [testing guide](https://developers.openai.com/apps-sdk/deploy/testing). The official documentation MCP could not be installed because the local `codex.exe` returned `Access is denied`, so only official OpenAI web pages were used as the permitted fallback.
- The decision remains **NO-GO**. OpenAI account eligibility, legal/privacy decisions, authenticated production evidence, reviewer assets, the tool-only CSP submission decision, and explicit approval to submit remain open.

## 3. Checklist evidence table

| Section | Checklist item | Status | Evidence | Remaining action |
| --- | --- | --- | --- | --- |
| A | Clean intended release commit | Verified | Clean `main`; local and remote at `d56fcb4`; reviewed Phase 9 diff and migration SQL | Reconfirm immediately before submission |
| A | Exact production deployment | Verified | Commit-specific Vercel status is successful; user confirmed the post-deployment system | Preserve the deployment until evidence capture is complete |
| A | Migration alignment | Verified | Local and remote migration lists match through `20260702124724` | Do not apply or rename migrations |
| A | Release commands | Verified | Lint, typecheck, 164 tests, build, high-severity audit gate, and `git diff --check` passed during this review | Repeat if code changes |
| B | Individual identity verification and publisher name | Needs manual OpenAI dashboard check | Repository consistently identifies Ahmed Mohamed as an individual; dashboard state is not accessible | Verify the individual identity and exact publisher name |
| B | `api.apps.write` / `api.apps.read` | Needs manual OpenAI dashboard check | Not visible from the repository | Verify project roles and permissions |
| B | Project eligibility and data residency | Needs manual OpenAI dashboard check | Official guide says EU data-residency projects currently cannot submit | Use an eligible global-residency project |
| C | Production environment variables and Supabase project binding | Needs production evidence | Public responses use the intended Plaivra origin, but Vercel environment values are not exposed | Verify `NEXT_PUBLIC_APP_URL`, `PLAIVRA_MCP_BASE_URL`, and Supabase project reference in Vercel |
| C | Homepage and public routes | Verified | Homepage, login, register, and all four legal pages returned `200`; content matches Plaivra's stated purpose | Recheck after any deployment |
| C | Support mailbox | Not verified | Address is published, but mailbox monitoring cannot be inferred | Ahmed must confirm it is monitored |
| C | No false OpenAI endorsement | Verified | Public OAuth consent says Plaivra is not approved or endorsed; repository search found no affirmative approval claim | Keep listing copy consistent |
| D | Authorization-server metadata | Verified | Production returned issuer, authorize/token endpoints, `none`, and `S256` | None unless metadata changes |
| D | Protected-resource metadata | Verified | Production resource is `https://plaivra.vercel.app/api/mcp`; documentation is `/legal/privacy` | None unless domain changes |
| D | Public scope hygiene | Verified | Both production documents exclude `plaivra.admin` and `plaivra.all` | Keep internal scopes out of public metadata |
| D | Predefined public OAuth client; no DCR/CIMD claim | Verified | Metadata has no registration/CIMD fields; `/api/oauth/register` returned intentional `404`; source uses a connection UUID client ID and no secret | Confirm the same client model in the submission dashboard |
| D | End-to-end Full Access account linking | User-confirmed | User stated the post-deployment system is working; this review did not perform a fresh authenticated ChatGPT flow | Capture Developer Mode evidence with the reviewer account |
| D | OAuth negative cases and token lifecycle | Verified | `lib/mcp/oauth.test.ts` covers missing/wrong PKCE, client, redirect, verifier, resource, replay, code/token expiry, revoked connection, and legacy-token rejection | Repeat critical cases in MCP Inspector where practical |
| D | Runtime auth challenges | Verified | Production MCP GET and `tools/list` returned `401` discovery challenges; unauthenticated `tools/call` returned safe `_meta["mcp/www_authenticate"]` with `plaivra.profile.read` | Verify insufficient-scope behavior with a real partial-scope token |
| D | Live authenticated tool `securitySchemes` | Needs production evidence | Local test verifies every visible tool; unauthenticated production `tools/list` correctly denies catalog access | Capture an authenticated production catalog in Developer Mode or MCP Inspector |
| D | Normal-flow 500/403/409/400 absence | Needs production evidence | Broad behavior is user-confirmed, but no retained authenticated network trace was supplied | Record the normal login, permission, consent, connect, and onboarding network flow |
| E | No access before saved AI permissions | Verified | Default UI state is empty; connection route and security tests reject missing/empty permission rows | Confirm with a fresh reviewer account |
| E | Full and Custom scope resolution | Verified | Scope, AI-permissions, connection-route, and server tests show Full Access is normal-user-only and Custom Access is section-limited | Capture both consent modes in production |
| E | Read/write and cross-section enforcement | Verified | `lib/mcp/server.test.ts` and `lib/mcp/scopes.test.ts` cover read-only denial, same-section write-implies-read, and cross-section denial | Repeat representative prompts in ChatGPT |
| E | `get_progress_summary` scope set | Verified | Registry and tests require progress, workouts, and nutrition read scopes together | Capture Full Access success and progress-only failure |
| E | Permission changes fail closed | Verified | Security tests cover missing/empty rows and immediate use of changed saved permissions | Capture narrowing/reconnect behavior in production |
| E | Consent display, revoke, and redacted activity | Verified in code/tests | Phase 5 and connection-route tests cover permission labels, owner-only revoke, consent revocation update, and redacted public activity | Retain screenshots and an authenticated before/after revoke trace |
| F | Production tool inventory | Needs production evidence | Source registry has 80 fully annotated tools; authenticated production inventory was not captured | Export authenticated `tools/list` and compare with the scope map |
| F | Scope filtering and admin exclusion | Verified | Server and safety tests restrict catalogs by scope and hide admin tools from normal users | Confirm against the production catalog |
| F | Write/destructive annotations | Verified | Safety test verifies read/write annotations and all eight destructive tools; every destructive input requires `confirm:true` | Capture one successful and one denied destructive prompt |
| F | Input/output safety | Verified | Tests cover undeclared identity fields, UUID/date/enum/range/length validation, secret/internal-field removal, and token-like redaction | Repeat representative abuse prompts in ChatGPT |
| F | Two-user isolation | Verified | `lib/mcp/security.test.ts` covers cross-user session and plan-day attempts; owner checks are reapplied server-side | Retain a synthetic two-user production test if policy permits |
| F | Prompt-injection handling | Verified in code/tests | MCP instructions treat saved text as data; raw notes are removed from tool output; injection test prompt is documented | Record actual ChatGPT output for prompt 21 |
| F | All reviewer scenarios | Not verified | Twenty-four scenarios and a permission matrix are prepared, but actual results are not attached | Run and record every scenario using synthetic data |
| G | German legal/privacy review | Needs legal review | Repository legal tests verify identity and disclosures; no legal sign-off is present | Obtain review or explicitly accept documented residual risk |
| G | PHI and sensitive-data classification | Needs legal review | OpenAI prohibits PHI and conditions sensitive-data collection; Plaivra handles body, sleep, wellness, and supplement data | Review every schema/free-text field and document necessity, consent, and disclosure |
| G | Processor, transfer, retention, and deletion decisions | Needs legal review | Privacy policy explicitly says several arrangements and final schedules remain unfinished | Finalize agreements, safeguards, retention periods, cleanup, and deletion runbook |
| G | Synthetic reviewer data | Not verified | The intended dataset is documented but no reviewer account was inspected | Prepare and verify a synthetic-only account with no PHI |
| G | Non-medical positioning | Verified | Public legal pages, MCP server instructions, package copy, and prompts reject diagnosis, treatment, prescription, clinical nutrition, emergencies, and guarantees | Preserve this framing in the dashboard listing |
| G | Audience suitability | Not verified | Registration currently states age 16+ while OpenAI's guideline addresses suitability for ages 13-17 | Confirm eligibility and accurately disclose the 16+ access policy |
| H | HTTPS, HSTS, and HTTP CSP | Verified | Production responses used HTTPS and included HSTS plus an HTTP Content-Security-Policy | Monitor after deployments |
| H | Apps SDK resource CSP for tool-only integration | Needs manual OpenAI dashboard check | No ChatGPT UI resource is registered; therefore there is no `_meta.ui.csp` resource to inspect | Confirm whether the dashboard validator accepts tool-only MCP without a resource CSP |
| H | Full authenticated console/network cleanliness | Needs production evidence | Public pages were healthy; a retained authenticated end-to-end trace is absent | Capture registration through revoke/export/privacy flows |
| H | Private progress photos | Verified | Migrations keep `progress-photos` private and owner-prefixed; photo helpers are owner-scoped; no MCP photo tool exists | Confirm bucket settings in the Supabase dashboard before submission |
| H | Admin API enforcement | Verified | `lib/security/admin-routes.test.ts` rejects unauthenticated and normal users across admin APIs | Keep server-side role checks |
| H | Monitoring, rate-limit RPC, backup, and incident procedures | Needs production evidence | Code has redacted logging and fallback behavior, but operational monitoring/runbooks were not demonstrated | Document monitoring, alerting, backup, incident, and revocation procedures |
| I | Listing name, category, and descriptions | Verified | Submission package uses `Plaivra`, fitness/nutrition/wellness planning support, and behavior-matched non-medical copy | Copy exactly into the dashboard draft |
| I | Logo | Needs manual OpenAI dashboard check | `public/plaivra-logo.png` exists as a 1254x1254 PNG (1,749,923 bytes) | Validate current dashboard format/size limits and preview rendering |
| I | Screenshots and reviewer account | Not verified | No current-production screenshot set or reviewer account evidence was supplied | Capture required screens using the synthetic reviewer account |
| I | Reviewer instructions and credentials | Not verified | Test prompts exist, but complete login/setup instructions were not found | Prepare secure reviewer instructions outside public repository credentials |
| I | Production MCP/OAuth URLs | Verified | Package and live metadata use `https://plaivra.vercel.app` and `/api/mcp`, with no placeholder URLs | Reconfirm in the dashboard draft |
| I | Test prompts and expected behavior | Verified | `docs/openai-app-test-prompts.md` contains 24 prompts, expected results, refusal behavior, and a permission matrix | Attach actual responses before submission |
| I | Localization and form fields | Needs manual OpenAI dashboard check | Required dashboard fields are unavailable locally | Complete and review the draft without submitting |
| I | Final reviewer note | Verified | Reviewer note is prepared below | Use only after all blockers are cleared |
| J | Final GO and approval | Not verified | Multiple blocking items remain and Ahmed has not explicitly approved submission | Keep NO-GO; obtain explicit approval only after all evidence is complete |

## 4. Production URL evidence

Checked at `2026-07-02T16:47:48.985Z`.

| URL | Expected | Observed | Result |
| --- | --- | --- | --- |
| `https://plaivra.vercel.app/` | `200` | `200` | Verified |
| `https://plaivra.vercel.app/login` | `200` | `200` | Verified |
| `https://plaivra.vercel.app/register` | `200` | `200` | Verified |
| `https://plaivra.vercel.app/legal/privacy` | `200` | `200` | Verified |
| `https://plaivra.vercel.app/legal/terms` | `200` | `200` | Verified |
| `https://plaivra.vercel.app/legal/impressum` | `200` | `200` | Verified |
| `https://plaivra.vercel.app/legal/disclaimer` | `200` | `200` | Verified |
| `https://plaivra.vercel.app/.well-known/oauth-authorization-server` | `200` | `200` | Verified |
| `https://plaivra.vercel.app/.well-known/oauth-protected-resource` | `200` | `200` | Verified |
| `https://plaivra.vercel.app/api/mcp` without authentication | `401` plus auth challenge | `401`; `resource_metadata="https://plaivra.vercel.app/.well-known/oauth-protected-resource"` | Verified |

Additional protocol checks:

- Unauthenticated `tools/list`: `401` with the same protected-resource discovery challenge.
- Unauthenticated `get_user_profile` tool call: MCP error result with `invalid_token`, a safe description, and `_meta["mcp/www_authenticate"]` requiring `plaivra.profile.read`.
- `POST /api/oauth/register`: intentional `404`; dynamic client registration is not supported.

## 5. Metadata checks

Production authorization-server metadata contains:

- issuer `https://plaivra.vercel.app`;
- authorization endpoint `https://plaivra.vercel.app/api/oauth/authorize`;
- token endpoint `https://plaivra.vercel.app/api/oauth/token`;
- grant type `authorization_code`;
- token endpoint authentication method `none`; and
- PKCE method `S256` only.

Production protected-resource metadata contains:

- resource `https://plaivra.vercel.app/api/mcp`;
- authorization server `https://plaivra.vercel.app`;
- bearer method `header`; and
- resource documentation `https://plaivra.vercel.app/legal/privacy`.

Neither production metadata document advertises `plaivra.admin` or legacy `plaivra.all`. Neither claims CIMD or DCR. The predefined public-client model is allowed by the current OpenAI authentication guide, but the final dashboard configuration remains a manual check.

## 6. OAuth/MCP behavior evidence

The reviewed routes delegate to centralized OAuth and MCP handlers:

- `app/api/oauth/authorize/route.ts` handles authorization and requires an authenticated Plaivra user for the consent decision.
- `app/api/oauth/token/route.ts` delegates token exchange to the OAuth handler.
- `app/api/mcp/route.ts` delegates MCP GET, POST, and OPTIONS behavior to the MCP server.
- `app/api/mcp/connections/route.ts` requires saved AI permissions before atomic connection rotation and revokes only the authenticated user's connection.
- `app/api/user/ai-permissions/route.ts` derives Full Access server-side and rejects blanket/admin scopes in Custom mode.

Automated tests verify code binding, one-time exchange, expiry, audience/resource binding, current saved permissions, revoked connections, legacy-token rejection, per-tool scope checks, safe authentication challenges, and output sanitization. No destructive production tool operation was performed during this review.

## 7. AI Permissions evidence

- New/default state is no saved AI access.
- Full Access resolves to `plaivra.full_access` plus the 16 normal user scopes and excludes admin access.
- Custom Access accepts only selected normal-user sections.
- Write implies read only within the same section; read does not imply write; cross-section access is denied.
- `get_progress_summary` requires all of `plaivra.progress.read`, `plaivra.workouts.read`, and `plaivra.nutrition.read`.
- Missing, empty, revoked, expired, or narrowed permission state fails closed.
- Connection revoke updates both connection state and the ChatGPT connection consent record in the route implementation.
- Activity output uses an allowlisted, redacted public shape.

The deployed Full Access ChatGPT connection is **User-confirmed**. Custom Access, progress-only failure, revoke, and activity evidence still need a retained authenticated production run.

## 8. Legal, privacy, and sensitive-data evidence

Repository evidence supports the individual operator identity, non-medical positioning, consent UI, redacted logs, authenticated privacy endpoints, and owner-scoped export. It does not constitute legal advice or legal approval.

The following remain blockers:

- final German legal/privacy review or explicit documented risk acceptance;
- field-by-field PHI and sensitive/special-category analysis;
- synthetic-only reviewer data verification;
- processor agreements and international-transfer safeguards;
- approved retention periods, automated cleanup, and deletion schedules;
- tested account deletion/revocation operations; and
- confirmation that the 16+ registration policy fits the current app-submission audience rules.

## 9. Submission assets evidence

- Listing name: `Plaivra` — verified in the package.
- Category: fitness, nutrition, and wellness planning support — verified in the package.
- Logo: `public/plaivra-logo.png` exists; it is a square 1254x1254 PNG. Dashboard acceptance remains unverified.
- MCP server: `https://plaivra.vercel.app/api/mcp` — verified in package and production metadata.
- Test prompts: 24 reviewer prompts plus a permission-mode matrix — verified.
- Screenshots, reviewer account, secure reviewer login/setup instructions, localization fields, and current production response captures — pending.

Prepared final reviewer note:

> Plaivra is a non-medical fitness, nutrition, and wellness organizer operated by Ahmed Mohamed as an individual. Access is permission-controlled, owner-scoped, and revocable. ChatGPT can use only the Plaivra categories and actions the user explicitly authorizes. Plaivra does not diagnose, treat, prescribe, provide clinical nutrition advice, provide emergency support, or guarantee outcomes.

## 10. Commands and results

| Command/check | Result |
| --- | --- |
| `git pull --ff-only origin main` | Passed; already up to date |
| `git status --short --branch` | Clean `main`, matching `origin/main` at review start |
| `git log --oneline -15` | Reviewed commit is latest |
| `npx.cmd supabase migration list` | Passed; local/remote aligned through `20260702124724` |
| Production HTTP and MCP protocol checks | Passed |
| Commit-specific Vercel deployment status | `success` |
| `npm.cmd run lint` | Passed |
| `npm.cmd run typecheck` | Passed |
| `npm.cmd test` | Passed: 15 files, 164 tests |
| `npm.cmd run build` | Passed |
| `npm.cmd audit --audit-level=high` | Passed gate; no high/critical findings, 3 moderate findings remain |
| `git diff --check` | Passed |

## 11. Final recommendation

**NO-GO for OpenAI submission.**

The deployed implementation and automated security evidence are in good shape, but the remaining OpenAI dashboard, legal/privacy, authenticated production, reviewer-account, screenshot, operational, and explicit-approval gates are blocking. Do not submit until every blocking checklist item is complete and Ahmed Mohamed gives explicit approval to submit.
