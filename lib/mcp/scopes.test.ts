import { describe, it, expect } from "vitest";
import {
  MCP_SCOPES,
  expandMcpScopes,
  hasScope,
  hasAnyScope,
  readScopeAllowed,
  migrateLegacyScopes,
  normalizeMcpScopes,
  resolveSavedAiPermissionScopes,
  MCP_NORMAL_USER_SCOPES
} from "./scopes";

describe("expandMcpScopes", () => {
  it("expands full_access to all normal user scopes", () => {
    const expanded = expandMcpScopes([MCP_SCOPES.fullAccess]);
    expect(expanded).toContain(MCP_SCOPES.fullAccess);
    for (const scope of MCP_NORMAL_USER_SCOPES) {
      expect(expanded).toContain(scope);
    }
  });

  it("expands plaivra.all to all normal user scopes", () => {
    const expanded = expandMcpScopes([MCP_SCOPES.all]);
    for (const scope of MCP_NORMAL_USER_SCOPES) {
      expect(expanded).toContain(scope);
    }
  });

  it("write implies read within the same section", () => {
    expect(expandMcpScopes([MCP_SCOPES.nutritionWrite])).toContain(MCP_SCOPES.nutritionRead);
    expect(expandMcpScopes([MCP_SCOPES.workoutsWrite])).toContain(MCP_SCOPES.workoutsRead);
    expect(expandMcpScopes([MCP_SCOPES.mealPlansWrite])).toContain(MCP_SCOPES.mealPlansRead);
    expect(expandMcpScopes([MCP_SCOPES.hydrationWrite])).toContain(MCP_SCOPES.hydrationRead);
    expect(expandMcpScopes([MCP_SCOPES.progressWrite])).toContain(MCP_SCOPES.progressRead);
    expect(expandMcpScopes([MCP_SCOPES.wellnessWrite])).toContain(MCP_SCOPES.wellnessRead);
    expect(expandMcpScopes([MCP_SCOPES.profileWrite])).toContain(MCP_SCOPES.profileRead);
    expect(expandMcpScopes([MCP_SCOPES.settingsWrite])).toContain(MCP_SCOPES.settingsRead);
  });

  it("does NOT cross-section imply read", () => {
    expect(expandMcpScopes([MCP_SCOPES.nutritionWrite])).not.toContain(MCP_SCOPES.workoutsRead);
    expect(expandMcpScopes([MCP_SCOPES.workoutsWrite])).not.toContain(MCP_SCOPES.nutritionRead);
    expect(expandMcpScopes([MCP_SCOPES.progressWrite])).not.toContain(MCP_SCOPES.wellnessRead);
  });

  it("does not duplicate scopes", () => {
    const expanded = expandMcpScopes([MCP_SCOPES.nutritionWrite, MCP_SCOPES.nutritionRead]);
    expect(expanded.filter((s) => s === MCP_SCOPES.nutritionRead).length).toBe(1);
    expect(expanded.filter((s) => s === MCP_SCOPES.nutritionWrite).length).toBe(1);
  });
});

describe("hasScope", () => {
  it("grants access when full_access is present", () => {
    expect(hasScope([MCP_SCOPES.fullAccess], MCP_SCOPES.nutritionWrite)).toBe(true);
    expect(hasScope([MCP_SCOPES.fullAccess], MCP_SCOPES.workoutsRead)).toBe(true);
  });

  it("grants access with exact scope match", () => {
    expect(hasScope([MCP_SCOPES.nutritionWrite], MCP_SCOPES.nutritionWrite)).toBe(true);
  });

  it("write implies read within same section", () => {
    expect(hasScope([MCP_SCOPES.nutritionWrite], MCP_SCOPES.nutritionRead)).toBe(true);
  });

  it("does not grant access across sections", () => {
    expect(hasScope([MCP_SCOPES.nutritionWrite], MCP_SCOPES.workoutsRead)).toBe(false);
    expect(hasScope([MCP_SCOPES.workoutsWrite], MCP_SCOPES.nutritionRead)).toBe(false);
  });

  it("read-only does not grant write", () => {
    expect(hasScope([MCP_SCOPES.nutritionRead], MCP_SCOPES.nutritionWrite)).toBe(false);
  });
});

describe("hasAnyScope", () => {
  it("returns true if any required scope matches", () => {
    expect(hasAnyScope([MCP_SCOPES.nutritionWrite], [MCP_SCOPES.nutritionRead, MCP_SCOPES.workoutsRead])).toBe(true);
  });

  it("returns false if no required scope matches", () => {
    expect(hasAnyScope([MCP_SCOPES.nutritionRead], [MCP_SCOPES.workoutsRead, MCP_SCOPES.progressWrite])).toBe(false);
  });
});

describe("readScopeAllowed", () => {
  it("allows read when full_access present", () => {
    expect(readScopeAllowed([MCP_SCOPES.fullAccess])).toBe(true);
  });

  it("allows read when any read scope present", () => {
    expect(readScopeAllowed([MCP_SCOPES.nutritionRead])).toBe(true);
  });

  it("allows read when any write scope present (implies read)", () => {
    expect(readScopeAllowed([MCP_SCOPES.nutritionWrite])).toBe(true);
  });

  it("denies read when no read/write scopes present", () => {
    expect(readScopeAllowed([MCP_SCOPES.admin])).toBe(false);
  });
});

describe("migrateLegacyScopes", () => {
  it("drops fitlife.all because blanket legacy access is not explicit consent", () => {
    const migrated = migrateLegacyScopes(["fitlife.all"]);
    expect(migrated).toEqual([]);
  });

  it("migrates fitlife.training.write to workouts.write + read", () => {
    const migrated = migrateLegacyScopes(["fitlife.training.write"]);
    expect(migrated).toContain(MCP_SCOPES.workoutsWrite);
    expect(migrated).toContain(MCP_SCOPES.workoutsRead);
  });

  it("migrates fitlife.nutrition.write to nutrition + meal_plans + hydration scopes", () => {
    const migrated = migrateLegacyScopes(["fitlife.nutrition.write"]);
    expect(migrated).toContain(MCP_SCOPES.nutritionWrite);
    expect(migrated).toContain(MCP_SCOPES.nutritionRead);
    expect(migrated).toContain(MCP_SCOPES.mealPlansWrite);
    expect(migrated).toContain(MCP_SCOPES.mealPlansRead);
    expect(migrated).toContain(MCP_SCOPES.hydrationWrite);
    expect(migrated).toContain(MCP_SCOPES.hydrationRead);
  });

  it("preserves already-canonical scopes", () => {
    const migrated = migrateLegacyScopes([MCP_SCOPES.nutritionWrite, MCP_SCOPES.workoutsRead]);
    expect(migrated).toContain(MCP_SCOPES.nutritionWrite);
    expect(migrated).toContain(MCP_SCOPES.workoutsRead);
  });

  it("drops unknown scopes safely", () => {
    const migrated = migrateLegacyScopes(["fitlife.unknown.scope"]);
    expect(migrated).not.toContain("fitlife.unknown.scope");
  });

  it("drops legacy and canonical admin/all/full scopes", () => {
    expect(migrateLegacyScopes(["fitlife.admin", "fitlife.full_access", MCP_SCOPES.admin, MCP_SCOPES.all, MCP_SCOPES.fullAccess])).toEqual([]);
  });
});

describe("normalizeMcpScopes", () => {
  it("returns fallback when input is empty", () => {
    expect(normalizeMcpScopes([], [MCP_SCOPES.fullAccess])).toContain(MCP_SCOPES.fullAccess);
  });

  it("filters out unsupported scopes", () => {
    expect(normalizeMcpScopes([MCP_SCOPES.nutritionWrite, "fitlife.unknown.scope"])).toContain(MCP_SCOPES.nutritionWrite);
    expect(normalizeMcpScopes([MCP_SCOPES.nutritionWrite, "fitlife.unknown.scope"])).not.toContain("fitlife.unknown.scope");
  });

  it("deduplicates scopes", () => {
    const result = normalizeMcpScopes([MCP_SCOPES.nutritionWrite, MCP_SCOPES.nutritionWrite]);
    expect(result.filter((s) => s === MCP_SCOPES.nutritionWrite).length).toBe(1);
  });
});

describe("resolveSavedAiPermissionScopes", () => {
  it("accepts explicit canonical full mode", () => {
    const scopes = resolveSavedAiPermissionScopes("full", [MCP_SCOPES.fullAccess, ...MCP_NORMAL_USER_SCOPES]);
    expect(scopes).toContain(MCP_SCOPES.fullAccess);
    expect(scopes).toContain(MCP_SCOPES.workoutsWrite);
    expect(scopes).toHaveLength(MCP_NORMAL_USER_SCOPES.length + 1);
  });

  it("fails closed when full mode is missing the explicit full-access marker", () => {
    expect(resolveSavedAiPermissionScopes("full", MCP_NORMAL_USER_SCOPES)).toEqual([]);
  });

  it("fails closed for an empty custom permission row", () => {
    expect(resolveSavedAiPermissionScopes("custom", [])).toEqual([]);
  });

  it("does not allow full access from custom mode", () => {
    expect(resolveSavedAiPermissionScopes("custom", [MCP_SCOPES.fullAccess])).toEqual([]);
  });

  it("drops admin/all scopes while retaining safe custom section scopes", () => {
    const scopes = resolveSavedAiPermissionScopes("custom", [MCP_SCOPES.admin, MCP_SCOPES.all, MCP_SCOPES.nutritionWrite]);
    expect(scopes).toContain(MCP_SCOPES.nutritionWrite);
    expect(scopes).toContain(MCP_SCOPES.nutritionRead);
    expect(scopes).not.toContain(MCP_SCOPES.admin);
    expect(scopes).not.toContain(MCP_SCOPES.all);
  });
});
