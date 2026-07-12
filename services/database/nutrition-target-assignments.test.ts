import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserNutritionTargetDateOverride, UserNutritionTargetProfile } from "@/types";

const userId = "11111111-1111-4111-8111-111111111111";
const date = "2026-07-12";

const { state, supabase, getNutritionTargetProfiles } = vi.hoisted(() => {
  const state: {
    override: UserNutritionTargetDateOverride | null;
    profile: UserNutritionTargetProfile;
    rpcError: boolean;
    skipProfileApply: boolean;
    insertErrorCode: string | null;
    operations: Array<{ kind: string; filters?: Array<[string, unknown]>; payload?: unknown }>;
  } = {
    override: null,
    profile: {} as UserNutritionTargetProfile,
    rpcError: false,
    skipProfileApply: false,
    insertErrorCode: null,
    operations: []
  };

  function from(table: string) {
    const filters: Array<[string, unknown]> = [];
    let insertPayload: Record<string, unknown> | null = null;
    const builder = {
      select() { return builder; },
      eq(key: string, value: unknown) { filters.push([key, value]); return builder; },
      gte() { return builder; },
      lte() { return builder; },
      order() { return builder; },
      insert(payload: Record<string, unknown>) { insertPayload = payload; return executeInsert(); },
      async maybeSingle() {
        state.operations.push({ kind: `${table}:select`, filters: [...filters] });
        const matches = state.override && filters.every(([key, value]) => (state.override as unknown as Record<string, unknown>)[key] === value);
        return { data: matches ? structuredClone(state.override) : null, error: null };
      }
    };
    async function executeInsert() {
      state.operations.push({ kind: `${table}:insert`, payload: insertPayload });
      if (state.insertErrorCode) return { data: null, error: { code: state.insertErrorCode } };
      state.override = {
        id: "override-id",
        user_id: String(insertPayload?.user_id),
        target_date: String(insertPayload?.target_date),
        target_type: insertPayload?.target_type as UserNutritionTargetDateOverride["target_type"],
        created_at: "2026-07-12T00:00:00Z",
        updated_at: "2026-07-12T00:00:00Z"
      };
      return { data: state.override, error: null };
    }
    return builder;
  }

  const supabase = {
    from: vi.fn(from),
    rpc: vi.fn(async (_name: string, params: Record<string, unknown>) => {
      state.operations.push({ kind: "rpc", payload: params });
      if (state.rpcError) return { data: null, error: { message: "rpc failed" } };
      if (!state.skipProfileApply) {
        state.profile = {
          ...state.profile,
          target_type: params.p_editor_target_type as UserNutritionTargetProfile["target_type"],
          calories: params.p_calories as number | null,
          protein_g: params.p_protein_g as number | null,
          carbs_g: params.p_carbs_g as number | null,
          fat_g: params.p_fat_g as number | null,
          water_ml: params.p_water_ml as number | null,
          notes: params.p_notes as string | null
        };
      }
      state.override = params.p_assignment === "auto" ? null : {
        id: "override-id",
        user_id: userId,
        target_date: String(params.p_target_date),
        target_type: params.p_assignment as UserNutritionTargetDateOverride["target_type"],
        created_at: "2026-07-12T00:00:00Z",
        updated_at: "2026-07-12T00:00:00Z"
      };
      return { data: {}, error: null };
    })
  };
  const getNutritionTargetProfiles = vi.fn(async () => [structuredClone(state.profile)]);
  return { state, supabase, getNutritionTargetProfiles };
});

vi.mock("@/lib/supabase/client", () => ({ supabase }));
vi.mock("@/lib/utils", () => ({ isUuid: () => true }));
vi.mock("@/services/database/execution-layer", () => ({ getNutritionTargetProfiles }));

function originalProfile(): UserNutritionTargetProfile {
  return {
    id: "profile-id",
    user_id: userId,
    target_type: "rest_day",
    calories: 1900,
    protein_g: 150,
    carbs_g: 180,
    fat_g: 65,
    water_ml: 3000,
    notes: "original",
    created_at: "2026-07-12T00:00:00Z",
    updated_at: "2026-07-12T00:00:00Z"
  };
}

const input = {
  userId,
  targetDate: date,
  assignment: "rest_day" as const,
  editorTargetType: "rest_day" as const,
  calories: 1850,
  proteinG: 160,
  carbsG: 170,
  fatG: 60,
  waterMl: 3200,
  notes: "updated"
};

beforeEach(() => {
  state.override = null;
  state.profile = originalProfile();
  state.rpcError = false;
  state.skipProfileApply = false;
  state.insertErrorCode = null;
  state.operations = [];
  vi.clearAllMocks();
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        removeItem: (key: string) => store.delete(key)
      },
      dispatchEvent: vi.fn()
    }
  });
});

describe("nutrition target assignment persistence", () => {
  it("applies and verifies profile plus explicit assignment as one RPC operation", async () => {
    const { applyNutritionTargetChanges } = await import("@/services/database/nutrition-target-assignments");
    const result = await applyNutritionTargetChanges(input);
    expect(result.assignment).toBe("rest_day");
    expect(result.profile).toMatchObject({ calories: 1850, protein_g: 160, notes: "updated" });
    expect(supabase.rpc).toHaveBeenCalledOnce();
  });

  it("removes the explicit assignment when Automatic is applied", async () => {
    state.override = { id: "override-id", user_id: userId, target_date: date, target_type: "training_day", created_at: "", updated_at: "" };
    const { applyNutritionTargetChanges } = await import("@/services/database/nutrition-target-assignments");
    const result = await applyNutritionTargetChanges({ ...input, assignment: "auto" });
    expect(result.assignment).toBe("auto");
    expect(result.override).toBeNull();
  });

  it("keeps the previous state when the atomic RPC fails", async () => {
    state.rpcError = true;
    const before = structuredClone(state.profile);
    const { applyNutritionTargetChanges } = await import("@/services/database/nutrition-target-assignments");
    await expect(applyNutritionTargetChanges(input)).rejects.toThrow("Could not apply");
    expect(state.profile).toEqual(before);
    expect(state.override).toBeNull();
  });

  it("returns a distinct critical error when persisted verification mismatches", async () => {
    state.skipProfileApply = true;
    const { applyNutritionTargetChanges, NUTRITION_TARGET_APPLY_CRITICAL_CODE } = await import("@/services/database/nutrition-target-assignments");
    await expect(applyNutritionTargetChanges(input)).rejects.toMatchObject({ code: NUTRITION_TARGET_APPLY_CRITICAL_CODE, requiresReload: true });
  });

  it("migrates a valid local assignment only when the server has no value", async () => {
    const { legacyNutritionTargetOverrideKey, migrateLegacyNutritionTargetOverride } = await import("@/services/database/nutrition-target-assignments");
    const key = legacyNutritionTargetOverrideKey(userId, date);
    window.localStorage.setItem(key, "high_activity_day");
    const migrated = await migrateLegacyNutritionTargetOverride(userId, date);
    expect(migrated?.target_type).toBe("high_activity_day");
    expect(window.localStorage.getItem(key)).toBeNull();
  });

  it("keeps an existing server assignment authoritative over legacy localStorage", async () => {
    state.override = { id: "override-id", user_id: userId, target_date: date, target_type: "rest_day", created_at: "", updated_at: "" };
    const { legacyNutritionTargetOverrideKey, migrateLegacyNutritionTargetOverride } = await import("@/services/database/nutrition-target-assignments");
    const key = legacyNutritionTargetOverrideKey(userId, date);
    window.localStorage.setItem(key, "training_day");
    const result = await migrateLegacyNutritionTargetOverride(userId, date);
    expect(result?.target_type).toBe("rest_day");
    expect(state.operations.some((operation) => operation.kind.endsWith(":insert"))).toBe(false);
  });
});
