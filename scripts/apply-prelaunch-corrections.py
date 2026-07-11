from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content.rstrip() + "\n", encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    content = read(path)
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f"Expected exactly one match in {path}, found {count}: {old[:120]!r}")
    write(path, content.replace(old, new, 1))


def replace_regex(path: str, pattern: str, replacement: str, flags: int = 0) -> None:
    content = read(path)
    updated, count = re.subn(pattern, replacement, content, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f"Expected exactly one regex match in {path}, found {count}: {pattern[:120]!r}")
    write(path, updated)


# 1. MCP output minimization: unavailable optional DB values must be omitted,
# not returned as schema-invalid nulls.
replace_once(
    "lib/mcp/safety.ts",
    ".filter(([key]) => !PRIVATE_OUTPUT_KEYS.test(key))",
    ".filter(([key, child]) => child !== null && child !== undefined && !PRIVATE_OUTPUT_KEYS.test(key))",
)

replace_once(
    "lib/mcp/context-projections.ts",
    'required: ["user_authored_labels", "areas_to_protect", "movement_restrictions", "retained_legacy_notes", "medical_interpretation_allowed"],',
    'required: ["user_authored_labels", "areas_to_protect", "medical_interpretation_allowed"],',
)
replace_once(
    "lib/mcp/context-projections.ts",
    'required: ["goal", "nutrition_preferences", "user_confirmed_restrictions", "default_targets", "target_profiles", "planning_preferences"],',
    'required: ["nutrition_preferences", "user_confirmed_restrictions", "target_profiles", "planning_preferences"],',
)
replace_once(
    "lib/mcp/context-projections.ts",
    'required: ["legacy_free_text", "planning_restrictions", "allergies", "medical_interpretation_allowed"],',
    'required: ["medical_interpretation_allowed"],',
)
replace_once(
    "lib/mcp/context-projections.ts",
    'wellness: { type: "object", additionalProperties: false, required: ["tasks", "habits", "recovery"],',
    'wellness: { type: "object", additionalProperties: false, required: ["tasks", "habits"],',
)
replace_once(
    "lib/mcp/context-projections.ts",
    'required: ["requested_plan_exercise_id", "active_plan", "recent_sessions", "functional_constraints"],',
    'required: ["recent_sessions", "functional_constraints"],',
)

# 2. Account deletion must block application access from submission time.
replace_once(
    "lib/integrations/env.ts",
    'if (accountState.data?.state === "deletion_processing" || accountState.data?.state === "disabled") {',
    'if (["deletion_pending", "deletion_processing", "legal_hold", "disabled"].includes(accountState.data?.state ?? "")) {',
)
replace_once(
    "app/api/user/privacy-requests/route.ts",
    'return NextResponse.json({ error: "The deletion request was recorded but processing could not be queued. Support has been notified." }, { status: 500 });',
    'return NextResponse.json({ error: "The deletion request was recorded, but processing could not be queued. Contact Plaivra support and do not submit a second request." }, { status: 500 });',
)

# Disable access before any provider cleanup adapter can block later deletion stages.
replace_once(
    "lib/privacy/account-deletion-worker.ts",
    '''    if (job.user_id) {
      const providerEvidence = await verifyProviderCleanup(admin, job.user_id);
      await updateJob(admin, job.id, { stage: "revoking_connections" });
      await revokeConnections(admin, job.user_id);

      await updateJob(admin, job.id, { stage: "disabling_access" });
      await disableAccount(admin, job.user_id);

      await updateJob(admin, job.id, { stage: "deleting_storage" });
      evidence = { ...evidence, ...await deleteStorage(admin, job.user_id) };

      await updateJob(admin, job.id, { stage: "provider_cleanup", evidence });
      evidence = { ...evidence, ...providerEvidence };

      await updateJob(admin, job.id, { stage: "deleting_database", evidence });
      evidence = { ...evidence, ...await purgeDatabaseAndAuth(admin, job.user_id) };
    }''',
    '''    if (job.user_id) {
      await updateJob(admin, job.id, { stage: "revoking_connections" });
      await revokeConnections(admin, job.user_id);

      await updateJob(admin, job.id, { stage: "disabling_access" });
      await disableAccount(admin, job.user_id);

      await updateJob(admin, job.id, { stage: "deleting_storage" });
      evidence = { ...evidence, ...await deleteStorage(admin, job.user_id) };

      await updateJob(admin, job.id, { stage: "provider_cleanup", evidence });
      const providerEvidence = await verifyProviderCleanup(admin, job.user_id);
      evidence = { ...evidence, ...providerEvidence };

      await updateJob(admin, job.id, { stage: "deleting_database", evidence });
      evidence = { ...evidence, ...await purgeDatabaseAndAuth(admin, job.user_id) };
    }''',
)

# 3. OAuth rate limiting must fail closed with an explicit 503, and auth codes
# must be atomically consumed only after all bindings and PKCE match.
replace_once(
    "lib/mcp/oauth.ts",
    '''export async function oauthRateLimit(key: string, limit: number, windowSeconds: number) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("consume_oauth_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds
  });

  if (error) return null; // fail open on rate-limit infra errors

  const row = (Array.isArray(data) ? data[0] : data) as { allowed?: boolean; reset_at?: string | null } | null;
  if (!row) return null;
  if (row.allowed !== false) return null;
  const resetAt = row.reset_at ? Date.parse(row.reset_at) : Date.now() + windowSeconds * 1000;
  return `Rate limit exceeded. Try again after ${Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))} seconds.`;
}''',
    '''export type OAuthRateLimitDecision = { status: 429 | 503; message: string } | null;

export async function oauthRateLimit(key: string, limit: number, windowSeconds: number): Promise<OAuthRateLimitDecision> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("consume_oauth_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds
  });

  if (error) {
    return { status: 503, message: "OAuth request protection is temporarily unavailable. Try again later." };
  }

  const row = (Array.isArray(data) ? data[0] : data) as { allowed?: boolean; reset_at?: string | null } | null;
  if (!row) {
    return { status: 503, message: "OAuth request protection is temporarily unavailable. Try again later." };
  }
  if (row.allowed !== false) return null;
  const resetAt = row.reset_at ? Date.parse(row.reset_at) : Date.now() + windowSeconds * 1000;
  return {
    status: 429,
    message: `Rate limit exceeded. Try again after ${Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))} seconds.`
  };
}''',
)

replace_once(
    "lib/mcp/oauth.ts",
    '''  if (rateLimitError) {
    return NextResponse.json({ error: "invalid_request", error_description: "Too many authorization requests. Please try again later." }, { status: 429, headers: metadataHeaders() });
  }''',
    '''  if (rateLimitError) {
    return NextResponse.json(
      { error: rateLimitError.status === 503 ? "temporarily_unavailable" : "invalid_request", error_description: rateLimitError.message },
      { status: rateLimitError.status, headers: metadataHeaders() }
    );
  }''',
)
replace_once(
    "lib/mcp/oauth.ts",
    '''  if (rateLimitError) {
    return NextResponse.json({ error: "invalid_request", error_description: "Too many authorization requests. Please try again later." }, { status: 429, headers: metadataHeaders() });
  }''',
    '''  if (rateLimitError) {
    return NextResponse.json(
      { error: rateLimitError.status === 503 ? "temporarily_unavailable" : "invalid_request", error_description: rateLimitError.message },
      { status: rateLimitError.status, headers: metadataHeaders() }
    );
  }''',
)
replace_once(
    "lib/mcp/oauth.ts",
    '''  if (rateLimitError) {
    return NextResponse.json({ error: "invalid_request", error_description: "Too many token requests. Please try again later." }, { status: 429, headers: metadataHeaders() });
  }''',
    '''  if (rateLimitError) {
    return NextResponse.json(
      { error: rateLimitError.status === 503 ? "temporarily_unavailable" : "invalid_request", error_description: rateLimitError.message },
      { status: rateLimitError.status, headers: metadataHeaders() }
    );
  }''',
)

replace_regex(
    "lib/mcp/oauth.ts",
    r'''async function verifyAuthorizationCode\(\n  code: string,\n  clientId: string,\n  redirectUri: string,\n  codeVerifier: string,\n  resource: string\n\): Promise<\{ scope: string; user_id: string; connection_id: string \}> \{.*?\n\}\n\nasync function createAccessToken''',
    '''async function verifyAuthorizationCode(
  code: string,
  clientId: string,
  redirectUri: string,
  codeVerifier: string,
  resource: string
): Promise<{ scope: string; user_id: string; connection_id: string }> {
  if (!code) throw new Error("Authorization code is required.");
  if (!codeVerifier) throw new Error("code_verifier is required.");

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("consume_mcp_oauth_authorization_code", {
    p_code_hash: hashAuthorizationCode(code),
    p_client_id: clientId,
    p_redirect_uri: redirectUri,
    p_code_challenge: pkceS256(codeVerifier),
    p_resource: resource
  });
  if (error) throw new Error("Authorization code verification is temporarily unavailable.");

  const row = (Array.isArray(data) ? data[0] : data) as {
    scope?: string[] | null;
    user_id?: string | null;
    connection_id?: string | null;
  } | null;
  if (!row?.user_id || !row.connection_id) {
    throw new Error("Authorization code is invalid, expired, already used, or does not match this request.");
  }

  return {
    scope: Array.isArray(row.scope) ? row.scope.join(" ") : "",
    user_id: row.user_id,
    connection_id: row.connection_id
  };
}

async function createAccessToken''',
    flags=re.S,
)

# 4. Replace MCP idempotency with a database-leased atomic claim protocol.
write(
    "lib/mcp/idempotency.ts",
    r'''import crypto from "node:crypto";
import type { McpContext } from "@/lib/mcp/auth";
import { fail, type McpToolResult } from "@/lib/mcp/tool-helpers";

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

type StoredResponse = Pick<McpToolResult, "structuredContent" | "isError">;
type ClaimRow = {
  action: "execute" | "replay" | "conflict" | "in_progress" | "review_required";
  ledger_id: string | null;
  response: unknown;
};

function restoreResponse(response: unknown): McpToolResult | null {
  if (!response || typeof response !== "object" || Array.isArray(response)) return null;
  const stored = response as Partial<StoredResponse>;
  if (!stored.structuredContent || typeof stored.structuredContent !== "object" || Array.isArray(stored.structuredContent)) return null;
  return {
    structuredContent: stored.structuredContent,
    content: [{ type: "text", text: JSON.stringify(stored.structuredContent) }],
    ...(stored.isError ? { isError: true } : {})
  };
}

export async function executeIdempotentMcpMutation({
  ctx,
  toolName,
  input,
  execute
}: {
  ctx: McpContext;
  toolName: string;
  input: Record<string, unknown>;
  execute: () => Promise<McpToolResult>;
}): Promise<McpToolResult> {
  const key = typeof input.idempotency_key === "string" ? input.idempotency_key.trim() : "";
  if (key.length < 16 || key.length > 200) {
    return fail("invalid_idempotency_key", "Provide a stable 16-200 character idempotency_key for this mutation.");
  }

  const keyHash = digest(`${ctx.userId}:${toolName}:${key}`);
  const inputHash = digest(canonicalJson(input));
  const claimed = await ctx.supabase.rpc("claim_mcp_idempotency_key", {
    p_user_id: ctx.userId,
    p_connection_id: ctx.connectionId,
    p_tool_name: toolName,
    p_key_hash: keyHash,
    p_input_hash: inputHash,
    p_lease_seconds: 120,
    p_ttl_seconds: 7 * 24 * 60 * 60
  });
  if (claimed.error) {
    return fail("idempotency_unavailable", "Plaivra could not establish replay protection. No change was attempted; retry later.");
  }

  const claim = (Array.isArray(claimed.data) ? claimed.data[0] : claimed.data) as ClaimRow | null;
  if (!claim) return fail("idempotency_unavailable", "Plaivra could not establish replay protection. No change was attempted; retry later.");
  if (claim.action === "conflict") {
    return fail("idempotency_conflict", "This idempotency_key was already used with different input. Use a new key for a different action.");
  }
  if (claim.action === "in_progress") {
    return fail("idempotency_in_progress", "An identical request is still being processed. Retry with the same key after a short delay.");
  }
  if (claim.action === "review_required") {
    return fail("idempotency_review_required", "A prior action may have completed without durable replay evidence. Review the affected record before retrying.");
  }
  if (claim.action === "replay") {
    return restoreResponse(claim.response)
      ?? fail("idempotency_review_required", "Stored replay evidence is incomplete. Review the affected record before retrying.");
  }
  if (claim.action !== "execute" || !claim.ledger_id) {
    return fail("idempotency_unavailable", "Plaivra could not establish replay protection. No change was attempted; retry later.");
  }

  let result: McpToolResult;
  try {
    result = await execute();
  } catch {
    result = fail("tool_execution_failed", "Plaivra could not complete this tool. No change should be assumed; review the affected record before retrying.");
  }

  const stored: StoredResponse = {
    structuredContent: result.structuredContent,
    ...(result.isError ? { isError: true } : {})
  };
  const persisted = await ctx.supabase
    .from("mcp_idempotency_keys")
    .update({
      status: result.isError ? "failed" : "completed",
      response: stored,
      lease_expires_at: null
    })
    .eq("id", claim.ledger_id)
    .eq("user_id", ctx.userId)
    .eq("input_hash", inputHash);
  if (persisted.error) {
    return fail("idempotency_persist_failed", "The action may have completed, but Plaivra could not save replay evidence. Review the affected record before retrying.");
  }
  return result;
}
''',
)

# 5. Database-owned release compatibility marker.
write(
    "lib/release/database-compatibility.ts",
    r'''import "server-only";
import { createSupabaseAdminClient, hasSupabaseAdminConfig } from "@/lib/server/supabase-admin";

export type DatabaseCompatibility = {
  available: boolean;
  version: string;
  migrationVersion: string | null;
};

export async function getDatabaseSchemaCompatibility(): Promise<DatabaseCompatibility> {
  if (!hasSupabaseAdminConfig()) return { available: false, version: "unavailable", migrationVersion: null };
  const result = await createSupabaseAdminClient()
    .from("release_schema_compatibility")
    .select("version,migration_version")
    .eq("singleton", true)
    .maybeSingle();
  if (result.error || !result.data?.version) {
    return { available: false, version: "unavailable", migrationVersion: null };
  }
  return {
    available: true,
    version: String(result.data.version),
    migrationVersion: typeof result.data.migration_version === "string" ? result.data.migration_version : null
  };
}
''',
)

write(
    "app/api/version/route.ts",
    r'''import { NextResponse } from "next/server";
import { getDatabaseSchemaCompatibility } from "@/lib/release/database-compatibility";
import { getReleaseVersion } from "@/lib/release/version";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const release = getReleaseVersion();
  const database = await getDatabaseSchemaCompatibility();
  const schemaCompatible = database.available && database.version === release.schemaCompatibilityVersion;
  return NextResponse.json({
    ...release,
    expectedSchemaCompatibilityVersion: release.schemaCompatibilityVersion,
    databaseSchemaCompatibilityVersion: database.version,
    databaseMigrationVersion: database.migrationVersion,
    schemaCompatible
  }, {
    status: schemaCompatible ? 200 : 503,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
''',
)

write(
    "lib/release/version-route.integration.test.ts",
    r'''import { beforeEach, describe, expect, it, vi } from "vitest";

const getDatabaseSchemaCompatibility = vi.fn();
vi.mock("@/lib/release/database-compatibility", () => ({ getDatabaseSchemaCompatibility }));

describe("GET /api/version", () => {
  beforeEach(() => {
    vi.resetModules();
    getDatabaseSchemaCompatibility.mockReset();
    vi.stubEnv("PLAIVRA_COMMIT_SHA", "60a204d5fc20fc396be1b1b47e748c42ebba6abf");
    vi.stubEnv("PLAIVRA_BUILD_TIMESTAMP", "2026-07-10T12:30:00.000Z");
    vi.stubEnv("PLAIVRA_RELEASE_ENVIRONMENT", "test");
    vi.stubEnv("PLAIVRA_SCHEMA_COMPATIBILITY_VERSION", "2");
  });

  it("returns 200 only when the database-owned marker matches the release requirement", async () => {
    getDatabaseSchemaCompatibility.mockResolvedValue({ available: true, version: "2", migrationVersion: "20260711013000" });
    const { GET } = await import("@/app/api/version/route");
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(body).toMatchObject({
      commitSha: "60a204d5fc20fc396be1b1b47e748c42ebba6abf",
      buildTimestamp: "2026-07-10T12:30:00.000Z",
      environment: "test",
      schemaCompatibilityVersion: "2",
      expectedSchemaCompatibilityVersion: "2",
      databaseSchemaCompatibilityVersion: "2",
      databaseMigrationVersion: "20260711013000",
      schemaCompatible: true
    });
  });

  it("fails closed when the database marker is missing or mismatched", async () => {
    getDatabaseSchemaCompatibility.mockResolvedValue({ available: false, version: "unavailable", migrationVersion: null });
    const { GET } = await import("@/app/api/version/route");
    const response = await GET();
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ schemaCompatible: false, databaseSchemaCompatibilityVersion: "unavailable" });
  });
});
''',
)

replace_once(
    "scripts/post-deploy-smoke.mjs",
    '''if (!version.schemaCompatibilityVersion) throw new Error("Schema compatibility version is missing.");''',
    '''if (!version.expectedSchemaCompatibilityVersion || !version.databaseSchemaCompatibilityVersion) {
  throw new Error("Release or database schema compatibility version is missing.");
}
if (version.schemaCompatible !== true) {
  throw new Error(`Database schema ${version.databaseSchemaCompatibilityVersion} is incompatible with release requirement ${version.expectedSchemaCompatibilityVersion}.`);
}''',
)

# 6. Durable Stripe ledger claim/retry worker.
write(
    "lib/billing/stripe-event-worker.ts",
    r'''import "server-only";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getStripeClient } from "@/lib/billing/stripe-server";
import { processStripeSubscriptionEvent } from "@/lib/billing/stripe-event-processor";

type BillingLedgerRow = {
  id: number;
  provider_event_id: string;
  processing_attempts: number;
};

function retryDelaySeconds(attempts: number) {
  return Math.min(6 * 60 * 60, Math.max(30, 30 * 2 ** Math.max(0, attempts - 1)));
}

async function markRetry(admin: SupabaseClient, row: BillingLedgerRow, errorCode: string) {
  const terminal = row.processing_attempts >= 8;
  const nextAttemptAt = new Date(Date.now() + retryDelaySeconds(row.processing_attempts) * 1000).toISOString();
  await admin.from("billing_event_ledger").update({
    processing_status: terminal ? "terminal_error" : "retryable_error",
    last_error_code: errorCode,
    next_attempt_at: nextAttemptAt,
    locked_at: null,
    ...(terminal ? { processed_at: new Date().toISOString() } : {})
  }).eq("id", row.id);
  return { ok: terminal, status: terminal ? "terminal_error" as const : "retryable_error" as const };
}

export async function processClaimedStripeEvent(admin: SupabaseClient, row: BillingLedgerRow, suppliedEvent?: Stripe.Event) {
  try {
    const event = suppliedEvent ?? await getStripeClient().events.retrieve(row.provider_event_id);
    const result = await processStripeSubscriptionEvent(admin, { id: row.id }, event);
    await admin.from("billing_event_ledger").update({ locked_at: null, next_attempt_at: new Date().toISOString() }).eq("id", row.id);
    return { ok: true, status: result.status };
  } catch (error) {
    console.error("Stripe billing event processing failed:", error instanceof Error ? error.message : "Unknown error");
    return markRetry(admin, row, "processing_failed");
  }
}

export async function claimStripeEvent(admin: SupabaseClient, providerEventId: string) {
  const claimed = await admin.rpc("claim_billing_event", {
    p_provider: "stripe",
    p_provider_event_id: providerEventId,
    p_lease_seconds: 120
  });
  if (claimed.error) throw new Error("Billing event claim failed.");
  return (Array.isArray(claimed.data) ? claimed.data[0] : claimed.data) as BillingLedgerRow | null;
}

export async function processPendingStripeEvents(admin: SupabaseClient, batchSize = 10) {
  const claimed = await admin.rpc("claim_billing_events", { p_batch_size: batchSize, p_lease_seconds: 120 });
  if (claimed.error) throw new Error("Billing event queue claim failed.");
  const rows = (claimed.data ?? []) as BillingLedgerRow[];
  const results = [];
  for (const row of rows) results.push(await processClaimedStripeEvent(admin, row));
  return { claimed: rows.length, results };
}
''',
)

write(
    "app/api/billing/stripe/webhook/route.ts",
    r'''import { NextResponse } from "next/server";
import { claimStripeEvent, processClaimedStripeEvent } from "@/lib/billing/stripe-event-worker";
import { createSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { hashBillingPayload, verifyStripeWebhook } from "@/lib/billing/stripe-server";
import { serverEnv } from "@/lib/integrations/env";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!serverEnv.stripeSecretKey || !serverEnv.stripeWebhookSecret || !serverEnv.supabaseServiceRoleKey) {
    return NextResponse.json({ error: "Billing webhook is not configured.", code: "billing_not_configured" }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Stripe signature is required.", code: "invalid_signature" }, { status: 400 });

  const payload = await request.text();
  let event;
  try {
    event = verifyStripeWebhook(payload, signature);
  } catch {
    return NextResponse.json({ error: "Stripe webhook signature is invalid.", code: "invalid_signature" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const inserted = await admin.from("billing_event_ledger").insert({
    provider: "stripe",
    provider_event_id: event.id,
    event_type: event.type,
    payload_sha256: hashBillingPayload(payload),
    provider_created_at: new Date(event.created * 1000).toISOString(),
    processing_status: "received",
    next_attempt_at: new Date().toISOString()
  }).select("id").single();

  if (inserted.error && inserted.error.code !== "23505") {
    return NextResponse.json({ error: "Billing event could not be recorded.", code: "ledger_unavailable" }, { status: 503 });
  }

  try {
    const claimed = await claimStripeEvent(admin, event.id);
    if (!claimed) return NextResponse.json({ received: true, duplicate: Boolean(inserted.error), queued: true });
    const result = await processClaimedStripeEvent(admin, claimed, event);
    return NextResponse.json(
      { received: true, status: result.status },
      { status: result.ok ? 200 : 500 }
    );
  } catch {
    return NextResponse.json({ error: "Billing event was recorded but could not be claimed safely.", code: "claim_unavailable" }, { status: 503 });
  }
}
''',
)

write(
    "app/api/internal/maintenance/billing-events/route.ts",
    r'''import { NextResponse } from "next/server";
import { processPendingStripeEvents } from "@/lib/billing/stripe-event-worker";
import { serverEnv } from "@/lib/integrations/env";
import { createSupabaseAdminClient } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!serverEnv.cronSecret || !serverEnv.stripeSecretKey || !serverEnv.supabaseServiceRoleKey) {
    return NextResponse.json({ error: "Billing maintenance is not configured." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${serverEnv.cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    const result = await processPendingStripeEvents(createSupabaseAdminClient(), 10);
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Billing maintenance failed." }, { status: 500 });
  }
}
''',
)

vercel = json.loads(read("vercel.json"))
crons = vercel.setdefault("crons", [])
if not any(item.get("path") == "/api/internal/maintenance/billing-events" for item in crons):
    crons.append({"path": "/api/internal/maintenance/billing-events", "schedule": "7 * * * *"})
write("vercel.json", json.dumps(vercel, indent=2))

# 7. Database migration for marker, atomic claims, leases, and stale recovery.
write(
    "supabase/migrations/20260711013000_prelaunch_runtime_safety_corrections.sql",
    r'''-- Runtime safety corrections discovered during independent branch verification.
-- Depends on the nine pending pre-launch migrations and performs no production action by itself.

create table if not exists public.release_schema_compatibility (
  singleton boolean primary key default true check (singleton),
  version text not null check (version ~ '^[0-9]+$'),
  migration_version text not null,
  applied_at timestamptz not null default now()
);
alter table public.release_schema_compatibility enable row level security;
revoke all on table public.release_schema_compatibility from public, anon, authenticated;
grant select, insert, update on table public.release_schema_compatibility to service_role;
insert into public.release_schema_compatibility (singleton, version, migration_version, applied_at)
values (true, '2', '20260711013000', now())
on conflict (singleton) do update set
  version = excluded.version,
  migration_version = excluded.migration_version,
  applied_at = excluded.applied_at;

create or replace function public.consume_mcp_oauth_authorization_code(
  p_code_hash text,
  p_client_id text,
  p_redirect_uri text,
  p_code_challenge text,
  p_resource text
)
returns table(scope text[], user_id uuid, connection_id uuid)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  return query
  update public.mcp_oauth_authorization_codes codes
  set used_at = now()
  where codes.code_hash = p_code_hash
    and codes.used_at is null
    and codes.expires_at > now()
    and codes.client_id = p_client_id
    and codes.redirect_uri = p_redirect_uri
    and codes.code_challenge_method = 'S256'
    and codes.code_challenge = p_code_challenge
    and codes.resource = p_resource
  returning codes.scope, codes.user_id, codes.connection_id;
end;
$$;
revoke all on function public.consume_mcp_oauth_authorization_code(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.consume_mcp_oauth_authorization_code(text, text, text, text, text) to service_role;

alter table public.mcp_idempotency_keys
  add column if not exists lease_expires_at timestamptz,
  add column if not exists attempt_count integer not null default 0 check (attempt_count >= 0);

create or replace function public.claim_mcp_idempotency_key(
  p_user_id uuid,
  p_connection_id uuid,
  p_tool_name text,
  p_key_hash text,
  p_input_hash text,
  p_lease_seconds integer default 120,
  p_ttl_seconds integer default 604800
)
returns table(action text, ledger_id uuid, response jsonb)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  existing public.mcp_idempotency_keys%rowtype;
  inserted_id uuid;
  safe_lease integer := greatest(30, least(coalesce(p_lease_seconds, 120), 600));
  safe_ttl integer := greatest(300, least(coalesce(p_ttl_seconds, 604800), 2592000));
begin
  insert into public.mcp_idempotency_keys (
    user_id, connection_id, tool_name, key_hash, input_hash, status,
    lease_expires_at, expires_at, attempt_count
  ) values (
    p_user_id, p_connection_id, p_tool_name, p_key_hash, p_input_hash, 'pending',
    now() + make_interval(secs => safe_lease), now() + make_interval(secs => safe_ttl), 1
  ) on conflict (user_id, tool_name, key_hash) do nothing
  returning id into inserted_id;

  if inserted_id is not null then
    return query select 'execute'::text, inserted_id, null::jsonb;
    return;
  end if;

  select * into existing
  from public.mcp_idempotency_keys keys
  where keys.user_id = p_user_id and keys.tool_name = p_tool_name and keys.key_hash = p_key_hash
  for update;

  if existing.id is null then
    return query select 'review_required'::text, null::uuid, null::jsonb;
    return;
  end if;
  if existing.input_hash <> p_input_hash then
    return query select 'conflict'::text, existing.id, existing.response;
    return;
  end if;
  if existing.status = 'completed' then
    if existing.response is null then
      return query select 'review_required'::text, existing.id, null::jsonb;
    else
      return query select 'replay'::text, existing.id, existing.response;
    end if;
    return;
  end if;
  if existing.status = 'pending' and existing.lease_expires_at is not null and existing.lease_expires_at > now() then
    return query select 'in_progress'::text, existing.id, existing.response;
    return;
  end if;

  update public.mcp_idempotency_keys keys
  set status = 'pending', response = null,
      connection_id = p_connection_id,
      lease_expires_at = now() + make_interval(secs => safe_lease),
      expires_at = now() + make_interval(secs => safe_ttl),
      attempt_count = keys.attempt_count + 1
  where keys.id = existing.id;
  return query select 'execute'::text, existing.id, null::jsonb;
end;
$$;
revoke all on function public.claim_mcp_idempotency_key(uuid, uuid, text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_mcp_idempotency_key(uuid, uuid, text, text, text, integer, integer) to service_role;

create or replace function public.claim_account_deletion_jobs(p_batch_size integer default 5)
returns setof public.account_deletion_jobs
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.account_deletion_jobs jobs
  set state = 'retry_scheduled',
      next_attempt_at = now(),
      locked_at = null,
      last_error_code = coalesce(jobs.last_error_code, 'stale_processing_recovered')
  where jobs.state = 'processing'
    and jobs.locked_at < now() - interval '15 minutes';

  return query
  with candidates as (
    select jobs.id
    from public.account_deletion_jobs jobs
    where jobs.state in ('queued', 'retry_scheduled')
      and jobs.next_attempt_at <= now()
    order by jobs.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_batch_size, 5), 25))
  )
  update public.account_deletion_jobs jobs
  set state = 'processing',
      locked_at = now(),
      attempt_count = jobs.attempt_count + 1
  where jobs.id in (select id from candidates)
  returning jobs.*;
end;
$$;
revoke all on function public.claim_account_deletion_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_account_deletion_jobs(integer) to service_role;

alter table public.billing_event_ledger
  add column if not exists next_attempt_at timestamptz not null default now(),
  add column if not exists locked_at timestamptz;
alter table public.billing_event_ledger drop constraint if exists billing_event_ledger_processing_status_check;
alter table public.billing_event_ledger add constraint billing_event_ledger_processing_status_check
  check (processing_status in ('received', 'processing', 'processed', 'ignored', 'retryable_error', 'terminal_error'));
drop index if exists public.billing_event_ledger_retry_idx;
create index billing_event_ledger_retry_idx
  on public.billing_event_ledger (processing_status, next_attempt_at, received_at)
  where processing_status in ('received', 'retryable_error', 'processing');

create or replace function public.claim_billing_event(
  p_provider text,
  p_provider_event_id text,
  p_lease_seconds integer default 120
)
returns setof public.billing_event_ledger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  safe_lease integer := greatest(30, least(coalesce(p_lease_seconds, 120), 600));
begin
  return query
  update public.billing_event_ledger events
  set processing_status = 'processing',
      processing_attempts = events.processing_attempts + 1,
      locked_at = now(),
      next_attempt_at = now() + make_interval(secs => safe_lease)
  where events.provider = p_provider
    and events.provider_event_id = p_provider_event_id
    and events.processing_status in ('received', 'retryable_error', 'processing')
    and events.next_attempt_at <= now()
    and (events.locked_at is null or events.locked_at < now() - make_interval(secs => safe_lease))
  returning events.*;
end;
$$;

create or replace function public.claim_billing_events(
  p_batch_size integer default 10,
  p_lease_seconds integer default 120
)
returns setof public.billing_event_ledger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  safe_lease integer := greatest(30, least(coalesce(p_lease_seconds, 120), 600));
begin
  return query
  with candidates as (
    select events.id
    from public.billing_event_ledger events
    where events.processing_status in ('received', 'retryable_error', 'processing')
      and events.next_attempt_at <= now()
      and (events.locked_at is null or events.locked_at < now() - make_interval(secs => safe_lease))
    order by events.received_at
    for update skip locked
    limit greatest(1, least(coalesce(p_batch_size, 10), 100))
  )
  update public.billing_event_ledger events
  set processing_status = 'processing',
      processing_attempts = events.processing_attempts + 1,
      locked_at = now(),
      next_attempt_at = now() + make_interval(secs => safe_lease)
  where events.id in (select id from candidates)
  returning events.*;
end;
$$;
revoke all on function public.claim_billing_event(text, text, integer) from public, anon, authenticated;
revoke all on function public.claim_billing_events(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_billing_event(text, text, integer) to service_role;
grant execute on function public.claim_billing_events(integer, integer) to service_role;
''',
)

# 8. Executable contract tests for all public tools and the nullable regression.
write(
    "lib/mcp/public-tool-output-contracts.test.ts",
    r'''import { describe, expect, it } from "vitest";
import { sanitizeMcpToolResult, validateMcpToolOutput } from "@/lib/mcp/safety";
import { mcpTools, type McpToolDefinition } from "@/lib/mcp/tools";
import type { McpToolResult } from "@/lib/mcp/tool-helpers";

type Schema = {
  type?: string;
  const?: unknown;
  enum?: unknown[];
  format?: string;
  minimum?: number;
  required?: string[];
  properties?: Record<string, Schema>;
  items?: Schema;
};

function sample(schema: Schema): unknown {
  if (Object.prototype.hasOwnProperty.call(schema, "const")) return schema.const;
  if (schema.enum?.length) return schema.enum[0];
  if (schema.type === "object") {
    const properties = schema.properties ?? {};
    return Object.fromEntries((schema.required ?? []).map((key) => [key, sample(properties[key] ?? {})]));
  }
  if (schema.type === "array") return [];
  if (schema.type === "boolean") return true;
  if (schema.type === "number") return schema.minimum ?? 1;
  if (schema.type === "string") return schema.format === "date-time" ? "2026-07-11T12:00:00.000Z" : "sample";
  return {};
}

function resultFor(tool: McpToolDefinition): McpToolResult {
  const structuredContent = sample(tool.outputSchema) as Record<string, unknown>;
  return { structuredContent, content: [{ type: "text", text: JSON.stringify(structuredContent) }] };
}

describe("public MCP output contracts", () => {
  it("has an executable closed output contract for all 35 public tools", () => {
    expect(mcpTools).toHaveLength(35);
    for (const tool of mcpTools) {
      expect(tool.outputSchema, tool.name).toBeTruthy();
      expect(validateMcpToolOutput(tool, resultFor(tool)), tool.name).toEqual({
        success: true,
        value: resultFor(tool).structuredContent
      });
    }
  });

  it("omits unavailable optional context values before contract validation", () => {
    const fixtures: Record<string, Record<string, unknown>> = {
      get_training_planning_context: {
        schema_version: "2026-07-1", task: "training_planning", generated_at: "2026-07-11T12:00:00.000Z",
        data_minimization: "task_specific", interpretation_notice: "notice",
        sections: {
          planning_profile: { goal: null, training_level: null, training_place: null, training_days_per_week: null, workout_duration_minutes: null },
          functional_constraints: { user_authored_labels: [], areas_to_protect: [], movement_restrictions: null, retained_legacy_notes: null, medical_interpretation_allowed: false },
          existing_plans: []
        }
      },
      get_nutrition_planning_context: {
        schema_version: "2026-07-1", task: "nutrition_planning", generated_at: "2026-07-11T12:00:00.000Z",
        data_minimization: "task_specific", interpretation_notice: "notice",
        sections: {
          goal: null, nutrition_preferences: [],
          user_confirmed_restrictions: { legacy_free_text: null, planning_restrictions: null, allergies: null, medical_interpretation_allowed: false },
          default_targets: null, target_profiles: [],
          planning_preferences: { weekly_food_budget: null, budget_currency: null, max_cooking_time_minutes: null, meal_prep_days: [], cooking_skill: null, kitchen_equipment: [], preferred_cuisines: [], disliked_foods: [], repeat_tolerance: null, meals_per_day: null, ingredient_reuse_preference: null, grocery_style_preference: null }
        }
      },
      get_workout_adjustment_context: {
        schema_version: "2026-07-1", task: "workout_adjustment", generated_at: "2026-07-11T12:00:00.000Z",
        data_minimization: "task_specific", interpretation_notice: "notice",
        sections: {
          requested_plan_exercise_id: null, active_plan: null, recent_sessions: [],
          functional_constraints: { user_authored_labels: [], areas_to_protect: [], movement_restrictions: null, retained_legacy_notes: null, medical_interpretation_allowed: false }
        }
      }
    };

    for (const [name, structuredContent] of Object.entries(fixtures)) {
      const tool = mcpTools.find((candidate) => candidate.name === name);
      expect(tool).toBeTruthy();
      const original: McpToolResult = { structuredContent, content: [{ type: "text", text: JSON.stringify(structuredContent) }] };
      const sanitized = sanitizeMcpToolResult(original, tool!.outputSchema);
      expect(JSON.stringify(sanitized.structuredContent), name).not.toContain(":null");
      expect(validateMcpToolOutput(tool!, sanitized), name).toMatchObject({ success: true });
    }
  });
});
''',
)

write(
    "lib/operations/prelaunch-runtime-safety.test.ts",
    r'''import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const file = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("prelaunch runtime safety migration", () => {
  const migration = file("supabase/migrations/20260711013000_prelaunch_runtime_safety_corrections.sql");

  it("owns the release compatibility marker in the database", () => {
    expect(migration).toContain("release_schema_compatibility");
    expect(migration).toContain("values (true, '2', '20260711013000'");
  });

  it("atomically consumes OAuth codes after all request bindings match", () => {
    expect(migration).toContain("consume_mcp_oauth_authorization_code");
    expect(migration).toContain("codes.code_challenge = p_code_challenge");
    expect(migration).toContain("codes.resource = p_resource");
  });

  it("provides leased recovery for idempotency, deletion, and billing jobs", () => {
    expect(migration).toContain("claim_mcp_idempotency_key");
    expect(migration).toContain("stale_processing_recovered");
    expect(migration).toContain("claim_billing_events");
  });
});
''',
)

# 9. Verification queries for the required isolated rehearsal.
write(
    "supabase/verification/prelaunch-row-reconciliation.sql",
    r'''-- Run before and after the full pending migration chain on an isolated production-like database.
-- Export each result as JSON and compare stable counts/links; do not run destructive cleanup here.

select jsonb_build_object(
  'workouts', (select count(*) from public.workouts),
  'exercises', (select count(*) from public.exercises),
  'legacy_workouts_linked', (select count(*) from public.exercises where legacy_workout_id is not null),
  'custom_meals', (select count(*) from public.custom_meals),
  'saved_recipes', (select count(*) from public.saved_recipes),
  'custom_meals_linked', (select count(*) from public.saved_recipes where source_custom_meal_id is not null),
  'custom_meal_items', (select count(*) from public.custom_meal_items),
  'saved_recipe_ingredients', (select count(*) from public.saved_recipe_ingredients),
  'custom_meal_items_linked', (select count(*) from public.saved_recipe_ingredients where source_custom_meal_item_id is not null),
  'scheduled_sessions', (select count(*) from public.user_workout_sessions),
  'performed_sessions', (select count(*) from public.workout_sessions),
  'linked_performed_sessions', (select count(*) from public.workout_sessions where scheduled_session_id is not null),
  'exercise_logs', (select count(*) from public.exercise_logs),
  'linked_snapshot_logs', (select count(*) from public.exercise_logs where source_user_exercise_log_id is not null)
) as reconciliation_counts;

select 'duplicate_scheduled_session_link' as violation, scheduled_session_id::text as key, count(*) as count
from public.workout_sessions where scheduled_session_id is not null
group by scheduled_session_id having count(*) > 1
union all
select 'duplicate_legacy_workout_link', legacy_workout_id::text, count(*)
from public.exercises where legacy_workout_id is not null
group by legacy_workout_id having count(*) > 1
union all
select 'duplicate_custom_meal_link', source_custom_meal_id::text, count(*)
from public.saved_recipes where source_custom_meal_id is not null
group by source_custom_meal_id having count(*) > 1;
''',
)

write(
    "supabase/verification/prelaunch-rls-policy-diff.sql",
    r'''-- Capture on the isolated database before and after migrations and diff the JSON output.
select jsonb_agg(to_jsonb(snapshot) order by snapshot.schemaname, snapshot.tablename, snapshot.policyname)
from (
  select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
  from pg_policies
  where schemaname in ('public', 'private')
) snapshot;

select jsonb_agg(to_jsonb(grants_snapshot) order by grants_snapshot.table_schema, grants_snapshot.table_name, grants_snapshot.grantee, grants_snapshot.privilege_type)
from (
  select table_schema, table_name, grantee, privilege_type
  from information_schema.role_table_grants
  where table_schema in ('public', 'private')
    and grantee in ('anon', 'authenticated', 'service_role')
) grants_snapshot;

select n.nspname as schema_name, p.proname as function_name, p.prosecdef as security_definer,
       pg_get_function_identity_arguments(p.oid) as arguments,
       pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'private') and p.prosecdef
order by n.nspname, p.proname, arguments;
''',
)

write(
    "supabase/verification/prelaunch-schema-compatibility.sql",
    r'''select singleton, version, migration_version, applied_at
from public.release_schema_compatibility
where singleton = true;

select to_regclass('public.release_schema_compatibility') is not null as marker_table_exists,
       to_regprocedure('public.consume_mcp_oauth_authorization_code(text,text,text,text,text)') is not null as oauth_atomic_consume_exists,
       to_regprocedure('public.claim_mcp_idempotency_key(uuid,uuid,text,text,text,integer,integer)') is not null as idempotency_claim_exists,
       to_regprocedure('public.claim_billing_events(integer,integer)') is not null as billing_claim_exists;
''',
)

# 10. Acceptance harnesses. These are executable only with a deployed review URL/token.
write(
    "scripts/chatgpt-tool-acceptance.mjs",
    r'''const base = process.env.PLAIVRA_DEPLOYMENT_URL;
const token = process.env.PLAIVRA_MCP_ACCESS_TOKEN;
if (!base || !token) throw new Error("Set PLAIVRA_DEPLOYMENT_URL and PLAIVRA_MCP_ACCESS_TOKEN.");
const endpoint = new URL("/api/mcp", base);
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const listResponse = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
if (!listResponse.ok) throw new Error(`tools/list HTTP ${listResponse.status}`);
const listed = await listResponse.json();
const tools = listed?.result?.tools;
if (!Array.isArray(tools) || tools.length !== 35) throw new Error(`Expected 35 tools, received ${Array.isArray(tools) ? tools.length : "invalid"}.`);
for (const tool of tools) {
  if (!tool.inputSchema || !tool.outputSchema || !Array.isArray(tool.securitySchemes)) throw new Error(`Incomplete contract: ${tool.name}`);
}
const statusResponse = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "get_plaivra_status", arguments: {} } }) });
if (!statusResponse.ok) throw new Error(`status tool HTTP ${statusResponse.status}`);
const status = await statusResponse.json();
if (status?.result?.isError || status?.result?.structuredContent?.ok !== true) throw new Error("get_plaivra_status failed.");
console.log(JSON.stringify({ acceptedAt: new Date().toISOString(), publicToolCount: tools.length, status: "passed" }, null, 2));
''',
)

# Update migration ledger without pretending the new migration was rehearsed.
ledger = json.loads(read("supabase/migration-ledger.json"))
local_file = "20260711013000_prelaunch_runtime_safety_corrections.sql"
if not any(entry.get("localFile") == local_file for entry in ledger["entries"]):
    ledger["entries"].append({
        "productionVersion": None,
        "productionName": None,
        "localFile": local_file,
        "state": "pending",
        "note": "Adds database-owned release compatibility, atomic OAuth code consumption, leased MCP idempotency recovery, stale deletion recovery, and durable billing claims. Isolated migration, concurrency, reconciliation, and RLS validation are mandatory."
    })
write("supabase/migration-ledger.json", json.dumps(ledger, indent=2))

print("Prelaunch correction patch applied successfully.")
