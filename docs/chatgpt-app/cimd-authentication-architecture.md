# Plaivra CIMD Authentication Architecture

**Status:** Target architecture

## 1. Decision

Plaivra will use Client ID Metadata Documents (CIMD) as the target method by which ChatGPT identifies its OAuth client to Plaivra.

The current per-user connection UUID/client-ID setup is a temporary compatibility implementation and is not the final public user journey.

## 2. Required journey

```text
ChatGPT discovers Plaivra MCP authentication metadata
→ ChatGPT presents a CIMD HTTPS client identifier
→ Plaivra retrieves and validates client metadata
→ user signs in on a Plaivra-branded domain
→ user reviews requested permissions
→ user approves or denies
→ authorization code returns to an exact validated redirect URI
→ token exchange uses PKCE S256 and resource binding
→ ChatGPT calls Plaivra MCP with the access token
```

## 3. Domain strategy

Target separation:

- `app.plaivra.com` — member web application;
- `auth.plaivra.com` — login, OAuth, consent, discovery;
- `mcp.plaivra.com` — public MCP endpoint and protected-resource metadata;
- `api.plaivra.com` — optional future public product API.

A smaller initial deployment may share infrastructure, but issuer, resource, origin, and redirect validation must remain explicit.

## 4. Discovery metadata

Plaivra must publish and test:

- protected resource metadata for the MCP server;
- authorization-server or OpenID Connect discovery metadata;
- supported authorization, token, revocation, and registration/client-identification capabilities;
- `client_id_metadata_document_supported: true` where required by the selected implementation;
- JWKS and signing-algorithm metadata when Plaivra issues signed tokens.

## 5. CIMD validation

When an HTTPS URL is supplied as `client_id`, Plaivra must:

1. require HTTPS;
2. reject credentials, fragments, unsafe schemes, and local/private network targets;
3. protect against SSRF and DNS rebinding;
4. fetch with strict time, redirect, and size limits;
5. require valid JSON and expected metadata fields;
6. require the document identity to match the `client_id` rules;
7. validate every redirect URI exactly;
8. validate token-endpoint authentication method and signing metadata;
9. cache only for a bounded period and revalidate safely;
10. fail closed when metadata is invalid or unavailable.

## 6. Authorization request validation

Validate:

- known issuer/authorization endpoint;
- CIMD client identity;
- exact redirect URI from the validated metadata document;
- `response_type=code`;
- PKCE challenge and `S256` method;
- requested scopes;
- MCP `resource` value;
- state and continuation integrity;
- consent-request expiry and single use.

## 7. Consent

The Plaivra consent screen must show:

- Plaivra and requesting-client identity;
- signed-in Plaivra account;
- each requested permission group;
- read versus write access;
- separately identified sensitive fitness constraints;
- approve and deny actions;
- revocation location;
- accurate privacy wording.

A generic Full Access preset may exist only when all included scopes are visible and sensitive scopes are not hidden.

## 8. Token exchange

Required controls:

- authorization code is single-use and short-lived;
- PKCE verifier is checked using constant-time comparison where appropriate;
- redirect URI, client identity, user, connection, scope, and resource match the authorization record;
- token lifetime is bounded;
- refresh tokens, if introduced, are rotated and revocable;
- tokens are stored hashed where server persistence is required;
- raw tokens never appear in logs.

Preferred client authentication when mutually supported: `private_key_jwt`.

Fallback for public-client behavior: no client secret plus PKCE S256.

## 9. MCP request authorization

For every request verify:

- signature or token hash;
- issuer;
- audience/resource;
- expiry and not-before;
- requested tool scope;
- active user and account;
- active, non-revoked connection;
- current `user_ai_permission_settings` intersection;
- ownership of every read or write target;
- destructive confirmation when required.

A previously issued token does not preserve a permission the user later revoked.

## 10. Migration from current connections

1. retain current connections temporarily for developer-mode compatibility;
2. add CIMD-capable validation and discovery;
3. create a new public ChatGPT connection type;
4. update consent and token records to separate client identity from user connection identity;
5. migrate tests;
6. remove manual client-ID instructions from product UI;
7. revoke or expire legacy connections after a communicated transition window;
8. remove legacy compatibility code and columns in a later migration.

## 11. Security tests

Required cases:

- valid CIMD happy path;
- non-HTTPS client ID;
- private-network/SSRF target;
- metadata redirect or oversize response;
- invalid metadata JSON;
- redirect URI not present in metadata;
- wrong PKCE verifier;
- authorization-code replay;
- wrong resource;
- wrong client identity;
- expired code/token;
- revoked connection;
- reduced saved permission after token issuance;
- cross-user target;
- malformed and duplicated scope;
- token/log redaction;
- denial and cancellation behavior.

## 12. Operational requirements

- metrics for authorization, denial, token exchange, revocation, and failures;
- redacted structured audit events;
- rate limiting that does not silently fail open;
- key rotation procedure;
- incident revocation procedure;
- stale authorization-code and token cleanup;
- production runbook and rollback plan.
