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
        raise RuntimeError(f"Expected one match in {path}, found {count}: {old[:100]!r}")
    write(path, content.replace(old, new, 1))


def replace_all(path: str, old: str, new: str, expected: int) -> None:
    content = read(path)
    count = content.count(old)
    if count != expected:
        raise RuntimeError(f"Expected {expected} matches in {path}, found {count}: {old[:100]!r}")
    write(path, content.replace(old, new))


def replace_regex(path: str, pattern: str, replacement: str, flags: int = 0) -> None:
    content = read(path)
    updated, count = re.subn(pattern, replacement, content, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f"Expected one regex match in {path}, found {count}: {pattern[:100]!r}")
    write(path, updated)


# 1. Enforce JSON Schema anyOf instead of silently ignoring it.
replace_once(
    "lib/mcp/safety.ts",
    "  format?: string;\n};",
    "  format?: string;\n  anyOf?: JsonSchema[];\n};",
)
replace_once(
    "lib/mcp/safety.ts",
    '''  if ("const" in schema && value !== schema.const) {
    errors.push(`${path} must equal the declared constant.`);
    return;
  }

  if (schema.type === "object") {''',
    '''  if ("const" in schema && value !== schema.const) {
    errors.push(`${path} must equal the declared constant.`);
    return;
  }

  if (schema.anyOf?.length) {
    const matchesAny = schema.anyOf.some((candidate) => {
      const candidateErrors: string[] = [];
      validateNode(value, candidate, path, candidateErrors);
      return candidateErrors.length === 0;
    });
    if (!matchesAny) errors.push(`${path} must match at least one allowed shape.`);
  }

  if (schema.type === "object") {''',
)

# Closed outputs must not retain an unbounded dynamic object that duplicates the stable ID list.
replace_regex(
    "lib/mcp/tool-executor-safe.ts",
    r'''  const createdByDate = createdItems\.reduce<Record<string, string\[\]>>\(\(grouped, item\) => \{.*?\n  \}, \{\}\);\n  return ok\(\{ ok: true, source_tool: sourceTool, created_count: createdIds\.length, created: createdByDate, created_meal_plan_item_ids: createdIds, planned_meal_ids: createdIds, items: createdItems \}\);''',
    '''  return ok({ ok: true, source_tool: sourceTool, created_count: createdIds.length, created_meal_plan_item_ids: createdIds, planned_meal_ids: createdIds, items: createdItems });''',
    flags=re.S,
)
replace_all(
    "lib/mcp/tools.ts",
    'source_tool: outputString, created_count: outputNumber, created: { type: "object" }, created_meal_plan_item_ids:',
    'source_tool: outputString, created_count: outputNumber, created_meal_plan_item_ids:',
    expected=2,
)

# Token throttling must cover a client/IP bucket, not a caller-controlled authorization-code bucket.
replace_once(
    "lib/mcp/oauth.ts",
    '  const rateLimitKey = `token:${rateLimitDigest(clientId)}:${rateLimitDigest(code)}`;',
    '  const rateLimitKey = `token:${oauthClientIp(request)}:${rateLimitDigest(clientId)}`;',
)

# 2. Make account deletion preflight providers before irreversible work and resume from its durable stage.
replace_once(
    "lib/privacy/account-deletion-worker.ts",
    '''] as const;

class DeletionWorkerError extends Error {''',
    '''] as const;

const ACCOUNT_DELETION_STAGE_INDEX = new Map<string, number>([
  ["queued", -1],
  ...ACCOUNT_DELETION_STAGES.map((stage, index) => [stage, index] as const)
]);

function shouldRunDeletionStage(currentStage: string, targetStage: typeof ACCOUNT_DELETION_STAGES[number]) {
  return (ACCOUNT_DELETION_STAGE_INDEX.get(currentStage) ?? -1) <= (ACCOUNT_DELETION_STAGE_INDEX.get(targetStage) ?? 0);
}

class DeletionWorkerError extends Error {''',
)
replace_once(
    "lib/privacy/account-deletion-worker.ts",
    '''  const deleted = await admin.auth.admin.deleteUser(userId, false);
  if (deleted.error) throw new DeletionWorkerError("auth_provider_delete_failed");
  return { auth_user_deleted: true };''',
    '''  const deleted = await admin.auth.admin.deleteUser(userId, false);
  const deletionStatus = deleted.error && "status" in deleted.error ? Number(deleted.error.status) : null;
  const alreadyAbsent = Boolean(deleted.error) && (deletionStatus === 404 || /not found/i.test(deleted.error?.message ?? ""));
  if (deleted.error && !alreadyAbsent) throw new DeletionWorkerError("auth_provider_delete_failed");
  return { auth_user_deleted: !alreadyAbsent, auth_user_already_absent: alreadyAbsent };''',
)
replace_regex(
    "lib/privacy/account-deletion-worker.ts",
    r'''export async function processAccountDeletionJob\(admin: SupabaseClient, job: AccountDeletionJob\) \{.*?\n\}''',
    '''export async function processAccountDeletionJob(admin: SupabaseClient, job: AccountDeletionJob) {
  try {
    if (job.user_id && await checkLegalHold(admin, job.user_id)) {
      await admin.from("account_access_states").upsert({
        user_id: job.user_id,
        state: "legal_hold",
        reason_code: "active_legal_hold"
      }, { onConflict: "user_id" });
      await updateJob(admin, job.id, {
        state: "blocked_legal_hold",
        last_error_code: "active_legal_hold",
        locked_at: null
      });
      return { state: "blocked_legal_hold" as const };
    }

    let evidence = { ...(job.evidence ?? {}) };
    if (job.user_id) {
      // Preflight every external provider before storage or Auth deletion. The
      // account is already denied by deletion_pending, so failing closed here
      // does not restore access or falsely claim provider revocation.
      if (shouldRunDeletionStage(job.stage, "provider_cleanup")) {
        evidence = { ...evidence, ...await verifyProviderCleanup(admin, job.user_id) };
      }

      if (shouldRunDeletionStage(job.stage, "revoking_connections")) {
        await updateJob(admin, job.id, { stage: "revoking_connections", evidence });
        await revokeConnections(admin, job.user_id);
      }

      if (shouldRunDeletionStage(job.stage, "disabling_access")) {
        await updateJob(admin, job.id, { stage: "disabling_access", evidence });
        await disableAccount(admin, job.user_id);
      }

      if (shouldRunDeletionStage(job.stage, "deleting_storage")) {
        await updateJob(admin, job.id, { stage: "deleting_storage", evidence });
        evidence = { ...evidence, ...await deleteStorage(admin, job.user_id) };
      }

      if (shouldRunDeletionStage(job.stage, "provider_cleanup")) {
        await updateJob(admin, job.id, { stage: "provider_cleanup", evidence });
      }

      if (shouldRunDeletionStage(job.stage, "deleting_database")) {
        await updateJob(admin, job.id, { stage: "deleting_database", evidence });
        evidence = { ...evidence, ...await purgeDatabaseAndAuth(admin, job.user_id) };
      }
    }

    let notificationStatus: "sent" | "not_configured" = "not_configured";
    if (shouldRunDeletionStage(job.stage, "notification")) {
      await updateJob(admin, job.id, { stage: "notification", evidence });
      notificationStatus = await sendCompletionNotification(job);
    }

    await updateJob(admin, job.id, {
      state: "completed",
      stage: "completed",
      evidence,
      notification_status: notificationStatus,
      notification_recipient_ciphertext: null,
      last_error_code: null,
      locked_at: null,
      completed_at: new Date().toISOString()
    });
    return { state: "completed" as const, notificationStatus };
  } catch (error) {
    const code = error instanceof DeletionWorkerError ? error.code : "unexpected_deletion_worker_error";
    const failed = job.attempt_count >= 5;
    const retryAt = new Date(Date.now() + deletionRetryDelayMinutes(job.attempt_count) * 60_000).toISOString();
    await updateJob(admin, job.id, {
      state: failed ? "failed" : "retry_scheduled",
      last_error_code: code,
      next_attempt_at: retryAt,
      locked_at: null
    }).catch(() => undefined);
    return { state: failed ? "failed" as const : "retry_scheduled" as const, errorCode: code };
  }
}''',
    flags=re.S,
)

# Strengthen deletion tests so provider preflight and notification-only resume are observable.
replace_once(
    "lib/privacy/account-deletion-worker.test.ts",
    "  return { client, calls, deleteUser, remove };",
    "  return { client, calls, deleteUser, updateUserById, remove };",
)
replace_once(
    "lib/privacy/account-deletion-worker.test.ts",
    '''    expect(mock.remove).not.toHaveBeenCalled();
    expect(mock.deleteUser).not.toHaveBeenCalled();
    expect(mock.calls.find((call) => call.table === "user_integrations")?.filters).toContainEqual(["user_id", "user-a"]);
  });
});''',
    '''    expect(mock.remove).not.toHaveBeenCalled();
    expect(mock.updateUserById).not.toHaveBeenCalled();
    expect(mock.deleteUser).not.toHaveBeenCalled();
    expect(mock.calls.find((call) => call.table === "user_integrations")?.filters).toContainEqual(["user_id", "user-a"]);
  });

  it("resumes a notification-stage retry without repeating deletion work", async () => {
    const mock = workerAdminMock();
    const result = await processAccountDeletionJob(mock.client, {
      id: "job-a", request_id: "request-a", user_id: "user-a", state: "processing", stage: "notification",
      attempt_count: 2, evidence: { auth_user_deleted: true }, notification_recipient_ciphertext: null
    });
    expect(result).toMatchObject({ state: "completed", notificationStatus: "not_configured" });
    expect(mock.remove).not.toHaveBeenCalled();
    expect(mock.updateUserById).not.toHaveBeenCalled();
    expect(mock.deleteUser).not.toHaveBeenCalled();
  });
});''',
)

# 3. Stripe ledger transitions are part of the durable contract and may not fail silently.
replace_once(
    "lib/billing/stripe-event-processor.ts",
    '''async function markLedger(admin: SupabaseClient, ledgerId: number, values: Record<string, unknown>) {
  await admin.from("billing_event_ledger").update(values).eq("id", ledgerId);
}''',
    '''async function markLedger(admin: SupabaseClient, ledgerId: number, values: Record<string, unknown>) {
  const result = await admin.from("billing_event_ledger").update(values).eq("id", ledgerId);
  if (result.error) throw result.error;
}''',
)
replace_once(
    "lib/billing/stripe-event-processor.ts",
    '''    subscription_id: subscription.data.id,
    processing_attempts: 1,
    last_error_code: null''',
    '''    subscription_id: subscription.data.id,
    last_error_code: null''',
)
replace_once(
    "lib/billing/stripe-event-worker.ts",
    '''  await admin.from("billing_event_ledger").update({
    processing_status: terminal ? "terminal_error" : "retryable_error",
    last_error_code: errorCode,
    next_attempt_at: nextAttemptAt,
    locked_at: null,
    ...(terminal ? { processed_at: new Date().toISOString() } : {})
  }).eq("id", row.id);
  return { ok: terminal, status: terminal ? "terminal_error" as const : "retryable_error" as const };''',
    '''  const updated = await admin.from("billing_event_ledger").update({
    processing_status: terminal ? "terminal_error" : "retryable_error",
    last_error_code: errorCode,
    next_attempt_at: nextAttemptAt,
    locked_at: null,
    ...(terminal ? { processed_at: new Date().toISOString() } : {})
  }).eq("id", row.id);
  if (updated.error) throw new Error("Billing event retry state could not be persisted.");
  return { ok: terminal, status: terminal ? "terminal_error" as const : "retryable_error" as const };''',
)
replace_once(
    "lib/billing/stripe-event-worker.ts",
    '''    const result = await processStripeSubscriptionEvent(admin, { id: row.id }, event);
    await admin.from("billing_event_ledger").update({ locked_at: null, next_attempt_at: new Date().toISOString() }).eq("id", row.id);
    return { ok: true, status: result.status };''',
    '''    const result = await processStripeSubscriptionEvent(admin, { id: row.id }, event);
    const unlocked = await admin.from("billing_event_ledger").update({ locked_at: null, next_attempt_at: new Date().toISOString() }).eq("id", row.id);
    if (unlocked.error) throw new Error("Billing event completion state could not be persisted.");
    return { ok: true, status: result.status };''',
)
replace_once(
    "app/api/billing/stripe/webhook/route.ts",
    '''    if (!claimed) return NextResponse.json({ received: true, duplicate: Boolean(inserted.error), queued: true });''',
    '''    if (!claimed) return NextResponse.json({ received: true, duplicate: Boolean(inserted.error), claim_status: "not_claimed" });''',
)
replace_once(
    "lib/billing/stripe-webhook-route.test.ts",
    '''    await expect(response.json()).resolves.toEqual({ received: true, duplicate: true, queued: true });''',
    '''    await expect(response.json()).resolves.toEqual({ received: true, duplicate: true, claim_status: "not_claimed" });''',
)

# 4. Expand validation and output closure tests.
replace_once(
    "lib/mcp/safety.test.ts",
    '''    expect(tool("activate_workout_plan").annotations.destructiveHint).toBe(false);
  });''',
    '''    expect(tool("activate_workout_plan").annotations.destructiveHint).toBe(false);
  });

  it("enforces anyOf requirements used by partial updates and composite tools", () => {
    expect(validateMcpToolInput(tool("update_food_log"), {
      food_log_id: validId,
      expected_updated_at: "2026-07-10T20:00:00Z"
    }).success).toBe(false);
    expect(validateMcpToolInput(tool("skip_workout"), {}).success).toBe(false);
    expect(validateMcpToolInput(tool("add_body_measurement"), {
      idempotency_key: "request-key-0001"
    }).success).toBe(false);
    expect(validateMcpToolInput(tool("add_body_measurement"), {
      waist_cm: 90,
      idempotency_key: "request-key-0001"
    }).success).toBe(true);
  });''',
)
replace_once(
    "lib/mcp/public-tool-output-contracts.test.ts",
    '''describe("public MCP output contracts", () => {
  it("has an executable closed output contract for all 35 public tools", () => {''',
    '''function assertClosedObjects(schema: Schema, path: string) {
  if (schema.type === "object") {
    expect((schema as Schema & { additionalProperties?: boolean }).additionalProperties, path).toBe(false);
    for (const [key, child] of Object.entries(schema.properties ?? {})) assertClosedObjects(child, `${path}.${key}`);
  }
  if (schema.type === "array" && schema.items) assertClosedObjects(schema.items, `${path}[]`);
}

describe("public MCP output contracts", () => {
  it("has an executable recursively closed output contract for all 35 public tools", () => {''',
)
replace_once(
    "lib/mcp/public-tool-output-contracts.test.ts",
    '''      expect(tool.outputSchema, tool.name).toBeTruthy();
      const result = resultFor(tool);''',
    '''      expect(tool.outputSchema, tool.name).toBeTruthy();
      assertClosedObjects(tool.outputSchema as Schema, tool.name);
      const result = resultFor(tool);''',
)
replace_once(
    "lib/mcp/public-tool-output-contracts.test.ts",
    '''  items?: Schema;
};''',
    '''  items?: Schema;
  additionalProperties?: boolean;
};''',
)

# Replace routing-only coverage with a real success-path execution contract over an in-memory Supabase adapter.
write(
    "lib/mcp/public-tool-handler-coverage.test.ts",
    r'''import { describe, expect, it } from "vitest";
import type { McpContext } from "@/lib/mcp/auth";
import { executeMcpTool } from "@/lib/mcp/tool-executor-safe";
import { sanitizeMcpToolResult, validateMcpToolInput, validateMcpToolOutput } from "@/lib/mcp/safety";
import { mcpTools } from "@/lib/mcp/tools";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const CONNECTION_ID = "22222222-2222-4222-8222-222222222222";
const FOOD_ID = "33333333-3333-4333-8333-333333333333";
const LOG_ID = "44444444-4444-4444-8444-444444444444";
const MEAL_ID = "55555555-5555-4555-8555-555555555555";
const PLAN_ID = "66666666-6666-4666-8666-666666666666";
const DAY_ID = "77777777-7777-4777-8777-777777777777";
const EXERCISE_ID = "88888888-8888-4888-8888-888888888888";
const SCHEDULED_ID = "99999999-9999-4999-8999-999999999999";
const SESSION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const UPDATED_AT = "2026-07-11T12:00:00.000Z";

type Row = Record<string, unknown>;
type Filter = { kind: "eq" | "is" | "in" | "gte" | "lte" | "ilike"; field: string; value: unknown };

function initialTables(): Record<string, Row[]> {
  return {
    profiles: [{ id: USER_ID, email: "reviewer@example.com", full_name: "Reviewer", role: "member", goal: "wellness", weight_kg: 80, height_cm: 175, age: 24, training_level: "advanced", activity_level: "active" }],
    onboarding_answers: [{ user_id: USER_ID, age: 24, training_place: "gym", days_per_week: 3, workout_duration_minutes: 45 }],
    user_fitness_constraints: [],
    user_ai_permission_settings: [{ user_id: USER_ID, access_mode: "full", scopes: ["plaivra.full_access"] }],
    calorie_targets: [{ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", user_id: USER_ID, daily_calories: 2000, protein_g: 160, carbs_g: 190, fat_g: 65, water_ml: 3000 }],
    food_items: [{ id: FOOD_ID, is_global: true, food_name: "sample", serving_size: "100 g", calories: 100, protein_g: 10, carbs_g: 12, fat_g: 2 }],
    user_food_items: [],
    food_logs: [{ id: LOG_ID, user_id: USER_ID, food_name: "sample", serving_size: "100 g", quantity: 1, calories: 100, protein_g: 10, carbs_g: 12, fat_g: 2, meal_type: "Breakfast", log_date: "2026-07-11", updated_at: UPDATED_AT }],
    saved_recipes: [],
    saved_recipe_ingredients: [],
    user_meal_plan_items: [{ id: MEAL_ID, user_id: USER_ID, plan_date: "2026-07-11", meal_type: "Breakfast", food_name: "sample", serving_size: "100 g", quantity: 1, calories: 100, protein_g: 10, carbs_g: 12, fat_g: 2, status: "planned", food_log_id: null, completed_at: null, updated_at: UPDATED_AT }],
    water_logs: [{ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", user_id: USER_ID, amount_ml: 250, log_date: "2026-07-11", updated_at: UPDATED_AT }],
    user_workout_plans: [{ id: PLAN_ID, user_id: USER_ID, name: "Plan", goal: "Strength", is_active: true, is_default: true, updated_at: UPDATED_AT }],
    user_workout_plan_days: [{ id: DAY_ID, plan_id: PLAN_ID, day_number: 1, day_name: "Day 1", focus: "Full body" }],
    user_workout_plan_exercises: [{ id: EXERCISE_ID, plan_day_id: DAY_ID, exercise_name: "Squat", sets: 3, reps: "8", sort_order: 1 }],
    user_workout_sessions: [{ id: SCHEDULED_ID, user_id: USER_ID, user_workout_plan_id: PLAN_ID, plan_day_id: DAY_ID, scheduled_date: "2026-07-11", session_number: 1, status: "scheduled" }],
    workout_sessions: [{ id: SESSION_ID, user_id: USER_ID, scheduled_session_id: SCHEDULED_ID, plan_id: PLAN_ID, plan_day_id: DAY_ID, status: "in_progress", started_at: UPDATED_AT }],
    exercise_logs: [],
    progress_entries: [],
    body_measurements: [],
    personal_records: [],
    sleep_recovery_logs: [],
    user_daily_checkins: [],
    user_nutrition_preference_profiles: [],
    user_nutrition_target_profiles: [],
    user_progression_targets: [],
    user_exercise_alternatives: [],
    daily_fit_tasks: [],
    fitness_habits: [],
    supplement_logs: [],
    user_consents: [],
    chatgpt_connections: []
  };
}

function createInMemorySupabase() {
  const tables = initialTables();
  let counter = 1;
  const nextId = () => `dddddddd-dddd-4ddd-8ddd-${String(counter++).padStart(12, "0")}`;

  function from(table: string) {
    let action: "select" | "insert" | "update" | "upsert" | "delete" = "select";
    let payload: Row | Row[] | null = null;
    let filters: Filter[] = [];
    let rowLimit: number | null = null;

    const matches = (row: Row) => filters.every((filter) => {
      const value = row[filter.field];
      if (filter.kind === "eq") return value === filter.value;
      if (filter.kind === "is") return value === filter.value;
      if (filter.kind === "in") return Array.isArray(filter.value) && filter.value.includes(value);
      if (filter.kind === "gte") return String(value ?? "") >= String(filter.value ?? "");
      if (filter.kind === "lte") return String(value ?? "") <= String(filter.value ?? "");
      if (filter.kind === "ilike") return String(value ?? "").toLowerCase().includes(String(filter.value ?? "").replaceAll("%", "").toLowerCase());
      return true;
    });

    const materialize = () => {
      const existing = tables[table] ?? (tables[table] = []);
      if (action === "insert" || action === "upsert") {
        const incoming = (Array.isArray(payload) ? payload : [payload ?? {}]).map((row) => ({
          id: typeof row.id === "string" ? row.id : nextId(),
          created_at: UPDATED_AT,
          updated_at: UPDATED_AT,
          ...row
        }));
        if (action === "upsert") {
          for (const row of incoming) {
            const index = existing.findIndex((candidate) => candidate.id === row.id || (row.user_id && candidate.user_id === row.user_id && row.target_type && candidate.target_type === row.target_type));
            if (index >= 0) existing[index] = { ...existing[index], ...row };
            else existing.push(row);
          }
        } else existing.push(...incoming);
        return { data: incoming, error: null };
      }
      const selected = existing.filter(matches);
      if (action === "update") {
        const updated = selected.map((row) => Object.assign(row, payload as Row, { updated_at: UPDATED_AT }));
        return { data: updated, error: null };
      }
      if (action === "delete") {
        const deleted = selected.slice();
        tables[table] = existing.filter((row) => !matches(row));
        return { data: deleted, error: null };
      }
      return { data: rowLimit === null ? selected : selected.slice(0, rowLimit), error: null };
    };

    const builder: Record<string, unknown> = {};
    builder.select = () => builder;
    builder.insert = (value: Row | Row[]) => { action = "insert"; payload = value; return builder; };
    builder.upsert = (value: Row | Row[]) => { action = "upsert"; payload = value; return builder; };
    builder.update = (value: Row) => { action = "update"; payload = value; return builder; };
    builder.delete = () => { action = "delete"; return builder; };
    builder.eq = (field: string, value: unknown) => { filters.push({ kind: "eq", field, value }); return builder; };
    builder.is = (field: string, value: unknown) => { filters.push({ kind: "is", field, value }); return builder; };
    builder.in = (field: string, value: unknown[]) => { filters.push({ kind: "in", field, value }); return builder; };
    builder.gte = (field: string, value: unknown) => { filters.push({ kind: "gte", field, value }); return builder; };
    builder.lte = (field: string, value: unknown) => { filters.push({ kind: "lte", field, value }); return builder; };
    builder.ilike = (field: string, value: unknown) => { filters.push({ kind: "ilike", field, value }); return builder; };
    builder.neq = () => builder;
    builder.or = () => builder;
    builder.not = () => builder;
    builder.order = () => builder;
    builder.limit = (value: number) => { rowLimit = value; return builder; };
    builder.range = () => builder;
    builder.single = async () => {
      const result = materialize();
      return { data: (result.data as Row[])[0] ?? null, error: result.error };
    };
    builder.maybeSingle = async () => {
      const result = materialize();
      return { data: (result.data as Row[])[0] ?? null, error: result.error };
    };
    builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(materialize()).then(resolve, reject);
    return builder;
  }

  return {
    from,
    rpc: async () => ({ data: [], error: null })
  } as unknown as McpContext["supabase"];
}

function inputFor(name: string): Record<string, unknown> {
  const key = `runtime-contract-${name}-0001`;
  const commonFood = { food_name: "sample", quantity: 1 };
  const inputs: Record<string, Record<string, unknown>> = {
    get_plaivra_status: {},
    get_training_planning_context: {},
    get_nutrition_planning_context: {},
    get_daily_execution_context: { date: "2026-07-11" },
    get_progress_context: { period_days: 30, end_date: "2026-07-11" },
    get_workout_adjustment_context: { plan_exercise_id: EXERCISE_ID },
    search_foods: { query: "sample", limit: 5 },
    add_food_log: { meal_type: "Breakfast", date: "2026-07-11", items: [commonFood], idempotency_key: key },
    get_food_logs_by_date: { date: "2026-07-11" },
    update_food_log: { food_log_id: LOG_ID, expected_updated_at: UPDATED_AT, calories: 120 },
    delete_food_log: { food_log_id: LOG_ID, confirm: true },
    create_custom_food: { food_name: "sample custom", serving_size: "100 g", calories: 120, protein_g: 12, carbs_g: 14, fat_g: 2, idempotency_key: key },
    create_custom_meal: { meal_name: "Sample meal", items: [commonFood], idempotency_key: key },
    create_day_meal_plan: { date: "2026-07-11", breakfast: [{ ...commonFood, calories: 100, protein: 10, carbs: 12, fat: 2 }], idempotency_key: key },
    create_week_meal_plan: { start_date: "2026-07-11", days: [{ date: "2026-07-11", meals: { breakfast: [{ ...commonFood, calories: 100, protein: 10, carbs: 12, fat: 2 }] } }], idempotency_key: key },
    get_meal_plan_for_date: { date: "2026-07-11" },
    get_meal_plan_for_week: { start_date: "2026-07-11" },
    update_meal_plan_item: { meal_plan_item_id: MEAL_ID, expected_updated_at: UPDATED_AT, food_name: "sample updated" },
    delete_meal_plan_item: { meal_plan_item_id: MEAL_ID, confirm: true },
    mark_meal_plan_item_done: { meal_plan_item_id: MEAL_ID, idempotency_key: key },
    generate_shopping_list: { start_date: "2026-07-11", end_date: "2026-07-17" },
    add_water_log: { amount_ml: 250, date: "2026-07-11", idempotency_key: key },
    get_water_summary: { date: "2026-07-11" },
    create_custom_workout_plan: { name: "Runtime plan", days: [{ day_name: "Day 1", day_number: 1, exercises: [{ exercise_name: "Squat", sets: 3, reps: "8" }] }], idempotency_key: key },
    get_workout_plan_by_id: { plan_id: PLAN_ID },
    activate_workout_plan: { plan_id: PLAN_ID, expected_updated_at: UPDATED_AT },
    delete_workout_plan: { plan_id: PLAN_ID, confirm: true },
    start_workout: { scheduled_session_id: SCHEDULED_ID, idempotency_key: key },
    log_exercise_sets: { workout_session_id: SESSION_ID, exercise_name: "Squat", sets: [{ set_number: 1, weight_kg: 80, reps: 8 }], idempotency_key: key },
    complete_workout: { workout_session_id: SESSION_ID, duration_minutes: 45, idempotency_key: key },
    skip_workout: { workout_session_id: SESSION_ID, reason: "Recovery", idempotency_key: key },
    add_weight_entry: { weight_kg: 80, date: "2026-07-11", idempotency_key: key },
    add_body_measurement: { measured_at: "2026-07-11", waist_cm: 90, idempotency_key: key },
    add_sleep_recovery_log: { date: "2026-07-11", hours_slept: 8, sleep_quality: "good", idempotency_key: key },
    upsert_daily_checkin: { checkin_date: "2026-07-11", checkin_type: "morning", energy_level: "good", idempotency_key: key }
  };
  return inputs[name] ?? {};
}

function context(): McpContext {
  return {
    supabase: createInMemorySupabase(),
    userId: USER_ID,
    connectionId: CONNECTION_ID,
    scopes: ["plaivra.full_access", "plaivra.profile.read", "plaivra.workouts.read", "plaivra.workouts.write", "plaivra.nutrition.read", "plaivra.nutrition.write", "plaivra.meal_plans.read", "plaivra.meal_plans.write", "plaivra.hydration.read", "plaivra.hydration.write", "plaivra.progress.read", "plaivra.progress.write", "plaivra.wellness.read", "plaivra.wellness.write"],
    profile: { id: USER_ID, email: "reviewer@example.com", full_name: "Reviewer", role: "member" }
  };
}

describe("public MCP runtime handler contracts", () => {
  it("executes and validates a success-path result for all 35 public tools", async () => {
    expect(mcpTools).toHaveLength(35);
    for (const tool of mcpTools) {
      const input = inputFor(tool.name);
      const inputValidation = validateMcpToolInput(tool, input);
      expect(inputValidation, `${tool.name} input`).toMatchObject({ success: true });
      if (!inputValidation.success) continue;

      const result = await executeMcpTool(context(), tool.name, inputValidation.value);
      expect(result.isError, `${tool.name}: ${JSON.stringify(result.structuredContent)}`).not.toBe(true);
      const sanitized = sanitizeMcpToolResult(result, tool.outputSchema);
      expect(validateMcpToolOutput(tool, sanitized), tool.name).toMatchObject({ success: true });
    }
  });
});
''',
)

# Runtime durability checks for Stripe worker update failures.
write(
    "lib/billing/stripe-event-worker.test.ts",
    r'''import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const mocks = vi.hoisted(() => ({ process: vi.fn(), retrieve: vi.fn() }));
vi.mock("@/lib/billing/stripe-event-processor", () => ({ processStripeSubscriptionEvent: mocks.process }));
vi.mock("@/lib/billing/stripe-server", () => ({ getStripeClient: () => ({ events: { retrieve: mocks.retrieve } }) }));

import { processClaimedStripeEvent } from "@/lib/billing/stripe-event-worker";

function adminWithLedgerUpdate(error: { message: string } | null) {
  const builder: Record<string, unknown> = {};
  builder.update = vi.fn(() => builder);
  builder.eq = vi.fn(async () => ({ data: null, error }));
  return { from: vi.fn(() => builder) } as unknown as SupabaseClient;
}

describe("Stripe durable event worker", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not report success when completion unlock cannot be persisted", async () => {
    mocks.process.mockResolvedValue({ status: "processed" });
    const event = { id: "evt_1", type: "customer.subscription.updated" } as never;
    await expect(processClaimedStripeEvent(adminWithLedgerUpdate({ message: "write failed" }), {
      id: 1,
      provider_event_id: "evt_1",
      processing_attempts: 1
    }, event)).rejects.toThrow("completion state");
  });

  it("does not hide a failed retry-state write", async () => {
    mocks.retrieve.mockRejectedValue(new Error("provider unavailable"));
    await expect(processClaimedStripeEvent(adminWithLedgerUpdate({ message: "write failed" }), {
      id: 1,
      provider_event_id: "evt_1",
      processing_attempts: 2
    })).rejects.toThrow("retry state");
  });
});
''',
)

# Force the patched PostCSS version throughout the dependency tree, then let npm
# regenerate the lockfile in CI before the clean verification run.
package_path = ROOT / "package.json"
package_data = json.loads(package_path.read_text(encoding="utf-8"))
package_data["overrides"] = {**package_data.get("overrides", {}), "postcss": "8.5.10"}
package_path.write_text(json.dumps(package_data, indent=2) + "\n", encoding="utf-8")

# The one-shot script must not remain in the final branch.
Path(__file__).unlink()
