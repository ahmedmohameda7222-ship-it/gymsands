import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserNutritionTargetDateOverride, UserNutritionTargetProfile } from "@/types";

const userId = "11111111-1111-4111-8111-111111111111";
const date = "2026-07-12";
const monday = "2026-07-13";
const tuesday = "2026-07-14";
const wednesday = "2026-07-15";

const { state, supabase, getNutritionTargetProfiles } = vi.hoisted(() => {
  const state: {
    overrides: Map<string, UserNutritionTargetDateOverride>;
    profile: UserNutritionTargetProfile;
    rpcError: boolean;
    skipProfileApply: boolean;
    upsertError: boolean;
    omitOnVerification: Set<string>;
    mismatchOnVerification: Map<string, UserNutritionTargetDateOverride["target_type"]>;
    rangeSelectCount: number;
    operations: Array<{ kind: string; filters?: Array<[string, unknown]>; payload?: unknown }>;
    store: Map<string, string>;
    dispatchEvent: ReturnType<typeof vi.fn>;
  } = {
    overrides: new Map(),
    profile: {} as UserNutritionTargetProfile,
    rpcError: false,
    skipProfileApply: false,
    upsertError: false,
    omitOnVerification: new Set(),
    mismatchOnVerification: new Map(),
    rangeSelectCount: 0,
    operations: [],
    store: new Map(),
    dispatchEvent: vi.fn()
  };

  function row(target_date: string, target_type: UserNutritionTargetDateOverride["target_type"], id = `override-${target_date}`): UserNutritionTargetDateOverride {
    return { id, user_id: userId, target_date, target_type, created_at: "2026-07-12T00:00:00Z", updated_at: "2026-07-12T00:00:00Z" };
  }

  function from(table: string) {
    const filters: Array<[string, unknown]> = [];
    let startDate: string | null = null;
    let endDate: string | null = null;
    const builder = {
      select() { return builder; },
      eq(key: string, value: unknown) { filters.push([key, value]); return builder; },
      gte(key: string, value: string) { if (key === "target_date") startDate = value; return builder; },
      lte(key: string, value: string) { if (key === "target_date") endDate = value; return builder; },
      async order() {
        state.rangeSelectCount += 1;
        state.operations.push({ kind: `${table}:range-select`, filters: [...filters], payload: { startDate, endDate } });
        let rows = Array.from(state.overrides.values())
          .filter((item) => (!startDate || item.target_date >= startDate) && (!endDate || item.target_date <= endDate))
          .sort((a, b) => a.target_date.localeCompare(b.target_date));
        if (state.rangeSelectCount >= 2) {
          rows = rows
            .filter((item) => !state.omitOnVerification.has(item.target_date))
            .map((item) => state.mismatchOnVerification.has(item.target_date)
              ? { ...item, target_type: state.mismatchOnVerification.get(item.target_date)! }
              : item);
        }
        return { data: structuredClone(rows), error: null };
      },
      async maybeSingle() {
        state.operations.push({ kind: `${table}:single-select`, filters: [...filters] });
        const targetDate = String(filters.find(([key]) => key === "target_date")?.[1] ?? "");
        const item = state.overrides.get(targetDate) ?? null;
        const matches = item && filters.every(([key, value]) => (item as unknown as Record<string, unknown>)[key] === value);
        return { data: matches ? structuredClone(item) : null, error: null };
      },
      async upsert(payload: Array<{ user_id: string; target_date: string; target_type: UserNutritionTargetDateOverride["target_type"] }>) {
        state.operations.push({ kind: `${table}:upsert`, payload: structuredClone(payload) });
        if (state.upsertError) return { data: null, error: { message: "upsert failed" } };
        payload.forEach((item) => {
          if (!state.overrides.has(item.target_date)) state.overrides.set(item.target_date, row(item.target_date, item.target_type));
        });
        return { data: null, error: null };
      }
    };
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
      const targetDate = String(params.p_target_date);
      if (params.p_assignment === "auto") state.overrides.delete(targetDate);
      else state.overrides.set(targetDate, row(targetDate, params.p_assignment as UserNutritionTargetDateOverride["target_type"]));
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

function override(target_date: string, target_type: UserNutritionTargetDateOverride["target_type"]): UserNutritionTargetDateOverride {
  return { id: `override-${target_date}`, user_id: userId, target_date, target_type, created_at: "", updated_at: "" };
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
  state.overrides = new Map();
  state.profile = originalProfile();
  state.rpcError = false;
  state.skipProfileApply = false;
  state.upsertError = false;
  state.omitOnVerification = new Set();
  state.mismatchOnVerification = new Map();
  state.rangeSelectCount = 0;
  state.operations = [];
  state.store = new Map();
  state.dispatchEvent = vi.fn();
  vi.clearAllMocks();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => state.store.get(key) ?? null,
        setItem: (key: string, value: string) => state.store.set(key, value),
        removeItem: (key: string) => state.store.delete(key)
      },
      dispatchEvent: state.dispatchEvent
    }
  });
  if (typeof globalThis.CustomEvent === "undefined") {
    Object.defineProperty(globalThis, "CustomEvent", {
      configurable: true,
      value: class<T> extends Event { detail: T; constructor(type: string, init?: { detail?: T }) { super(type); this.detail = init?.detail as T; } }
    });
  }
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
    state.overrides.set(date, override(date, "training_day"));
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
    expect(state.overrides.size).toBe(0);
  });

  it("returns a distinct critical error when persisted verification mismatches", async () => {
    state.skipProfileApply = true;
    const { applyNutritionTargetChanges, NUTRITION_TARGET_APPLY_CRITICAL_CODE } = await import("@/services/database/nutrition-target-assignments");
    await expect(applyNutritionTargetChanges(input)).rejects.toMatchObject({ code: NUTRITION_TARGET_APPLY_CRITICAL_CODE, requiresReload: true });
  });
});

describe("legacy target assignment batch migration", () => {
  it("migrates one legacy override and removes its key only after verification", async () => {
    const { legacyNutritionTargetOverrideKey, migrateLegacyNutritionTargetOverridesForDates } = await import("@/services/database/nutrition-target-assignments");
    const key = legacyNutritionTargetOverrideKey(userId, wednesday);
    window.localStorage.setItem(key, "high_activity_day");
    const result = await migrateLegacyNutritionTargetOverridesForDates(userId, [monday, tuesday, wednesday]);
    expect(result.find((item) => item.target_date === wednesday)?.target_type).toBe("high_activity_day");
    expect(window.localStorage.getItem(key)).toBeNull();
    expect(state.rangeSelectCount).toBe(2);
  });

  it("migrates multiple overrides in one ownership-scoped batch", async () => {
    const { legacyNutritionTargetOverrideKey, migrateLegacyNutritionTargetOverridesForDates } = await import("@/services/database/nutrition-target-assignments");
    window.localStorage.setItem(legacyNutritionTargetOverrideKey(userId, monday), "training_day");
    window.localStorage.setItem(legacyNutritionTargetOverrideKey(userId, wednesday), "rest_day");
    await migrateLegacyNutritionTargetOverridesForDates(userId, [monday, tuesday, wednesday]);
    const upsert = state.operations.find((operation) => operation.kind.endsWith(":upsert"));
    expect(upsert?.payload).toEqual([
      { user_id: userId, target_date: monday, target_type: "training_day" },
      { user_id: userId, target_date: wednesday, target_type: "rest_day" }
    ]);
  });

  it("keeps an existing server assignment authoritative and does not overwrite or remove the conflicting local key", async () => {
    state.overrides.set(monday, override(monday, "rest_day"));
    const { legacyNutritionTargetOverrideKey, migrateLegacyNutritionTargetOverridesForDates } = await import("@/services/database/nutrition-target-assignments");
    const key = legacyNutritionTargetOverrideKey(userId, monday);
    window.localStorage.setItem(key, "training_day");
    const result = await migrateLegacyNutritionTargetOverridesForDates(userId, [monday]);
    expect(result[0]?.target_type).toBe("rest_day");
    expect(window.localStorage.getItem(key)).toBe("training_day");
    expect(state.operations.some((operation) => operation.kind.endsWith(":upsert"))).toBe(false);
  });

  it("keeps local keys when the batch upsert fails", async () => {
    state.upsertError = true;
    const { legacyNutritionTargetOverrideKey, migrateLegacyNutritionTargetOverridesForDates } = await import("@/services/database/nutrition-target-assignments");
    const key = legacyNutritionTargetOverrideKey(userId, monday);
    window.localStorage.setItem(key, "training_day");
    await expect(migrateLegacyNutritionTargetOverridesForDates(userId, [monday])).rejects.toThrow("Could not migrate");
    expect(window.localStorage.getItem(key)).toBe("training_day");
  });

  it("keeps local keys when verification is missing or mismatched", async () => {
    const { legacyNutritionTargetOverrideKey, migrateLegacyNutritionTargetOverridesForDates } = await import("@/services/database/nutrition-target-assignments");
    const firstKey = legacyNutritionTargetOverrideKey(userId, monday);
    window.localStorage.setItem(firstKey, "training_day");
    state.omitOnVerification.add(monday);
    await expect(migrateLegacyNutritionTargetOverridesForDates(userId, [monday])).rejects.toThrow("Could not verify");
    expect(window.localStorage.getItem(firstKey)).toBe("training_day");

    state.overrides = new Map();
    state.rangeSelectCount = 0;
    state.omitOnVerification.clear();
    state.mismatchOnVerification.set(tuesday, "rest_day");
    const secondKey = legacyNutritionTargetOverrideKey(userId, tuesday);
    window.localStorage.setItem(secondKey, "training_day");
    await expect(migrateLegacyNutritionTargetOverridesForDates(userId, [tuesday])).rejects.toThrow("Could not verify");
    expect(window.localStorage.getItem(secondKey)).toBe("training_day");
  });

  it("ignores invalid values and removes obsolete auto keys without a database write", async () => {
    const { legacyNutritionTargetOverrideKey, migrateLegacyNutritionTargetOverridesForDates } = await import("@/services/database/nutrition-target-assignments");
    const invalidKey = legacyNutritionTargetOverrideKey(userId, monday);
    const autoKey = legacyNutritionTargetOverrideKey(userId, tuesday);
    window.localStorage.setItem(invalidKey, "invalid");
    window.localStorage.setItem(autoKey, "auto");
    await migrateLegacyNutritionTargetOverridesForDates(userId, [monday, tuesday]);
    expect(window.localStorage.getItem(invalidKey)).toBe("invalid");
    expect(window.localStorage.getItem(autoKey)).toBeNull();
    expect(state.operations.some((operation) => operation.kind.endsWith(":upsert"))).toBe(false);
  });

  it("deduplicates input dates and does not migrate dates outside the request", async () => {
    const { legacyNutritionTargetOverrideKey, migrateLegacyNutritionTargetOverridesForDates } = await import("@/services/database/nutrition-target-assignments");
    const inside = legacyNutritionTargetOverrideKey(userId, monday);
    const outside = legacyNutritionTargetOverrideKey(userId, wednesday);
    window.localStorage.setItem(inside, "training_day");
    window.localStorage.setItem(outside, "high_activity_day");
    await migrateLegacyNutritionTargetOverridesForDates(userId, [monday, monday, "not-a-date"]);
    const payload = state.operations.find((operation) => operation.kind.endsWith(":upsert"))?.payload as unknown[];
    expect(payload).toHaveLength(1);
    expect(window.localStorage.getItem(outside)).toBe("high_activity_day");
    expect(state.overrides.has(wednesday)).toBe(false);
  });

  it("uses the same rules through the single-date wrapper", async () => {
    const { legacyNutritionTargetOverrideKey, migrateLegacyNutritionTargetOverride } = await import("@/services/database/nutrition-target-assignments");
    const key = legacyNutritionTargetOverrideKey(userId, date);
    window.localStorage.setItem(key, "default_day");
    const result = await migrateLegacyNutritionTargetOverride(userId, date);
    expect(result?.target_type).toBe("default_day");
    expect(window.localStorage.getItem(key)).toBeNull();
  });

  it("dispatches refresh events only after verified migration", async () => {
    const { legacyNutritionTargetOverrideKey, migrateLegacyNutritionTargetOverridesForDates } = await import("@/services/database/nutrition-target-assignments");
    window.localStorage.setItem(legacyNutritionTargetOverrideKey(userId, monday), "training_day");
    await migrateLegacyNutritionTargetOverridesForDates(userId, [monday]);
    expect(state.dispatchEvent).toHaveBeenCalledOnce();

    state.overrides = new Map();
    state.rangeSelectCount = 0;
    state.upsertError = true;
    state.dispatchEvent.mockClear();
    window.localStorage.setItem(legacyNutritionTargetOverrideKey(userId, tuesday), "rest_day");
    await expect(migrateLegacyNutritionTargetOverridesForDates(userId, [tuesday])).rejects.toThrow();
    expect(state.dispatchEvent).not.toHaveBeenCalled();
  });
});
