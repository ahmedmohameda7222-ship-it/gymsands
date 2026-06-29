export const MCP_SCOPES = {
  fullAccess: "plaivra.full_access",

  workoutsRead: "plaivra.workouts.read",
  workoutsWrite: "plaivra.workouts.write",

  nutritionRead: "plaivra.nutrition.read",
  nutritionWrite: "plaivra.nutrition.write",

  mealPlansRead: "plaivra.meal_plans.read",
  mealPlansWrite: "plaivra.meal_plans.write",

  hydrationRead: "plaivra.hydration.read",
  hydrationWrite: "plaivra.hydration.write",

  progressRead: "plaivra.progress.read",
  progressWrite: "plaivra.progress.write",

  wellnessRead: "plaivra.wellness.read",
  wellnessWrite: "plaivra.wellness.write",

  profileRead: "plaivra.profile.read",
  profileWrite: "plaivra.profile.write",

  settingsRead: "plaivra.settings.read",
  settingsWrite: "plaivra.settings.write",

  admin: "plaivra.admin",
  all: "plaivra.all" // legacy alias, prefer fullAccess
} as const;

// Normal user scopes (non-admin)
export const MCP_NORMAL_USER_SCOPES = [
  MCP_SCOPES.workoutsRead,
  MCP_SCOPES.workoutsWrite,
  MCP_SCOPES.nutritionRead,
  MCP_SCOPES.nutritionWrite,
  MCP_SCOPES.mealPlansRead,
  MCP_SCOPES.mealPlansWrite,
  MCP_SCOPES.hydrationRead,
  MCP_SCOPES.hydrationWrite,
  MCP_SCOPES.progressRead,
  MCP_SCOPES.progressWrite,
  MCP_SCOPES.wellnessRead,
  MCP_SCOPES.wellnessWrite,
  MCP_SCOPES.profileRead,
  MCP_SCOPES.profileWrite,
  MCP_SCOPES.settingsRead,
  MCP_SCOPES.settingsWrite
];

export const MCP_SUPPORTED_SCOPES = [
  MCP_SCOPES.fullAccess,
  ...MCP_NORMAL_USER_SCOPES,
  MCP_SCOPES.admin,
  MCP_SCOPES.all
];

export const MCP_FULL_ACCESS_SCOPES = [MCP_SCOPES.fullAccess, ...MCP_NORMAL_USER_SCOPES];

// No MCP permission is implicit. Full access is available only through an
// explicitly saved access_mode="full" preference.
export const MCP_DEFAULT_SCOPES: readonly string[] = [];

export const supportedScopeSet = new Set<string>(MCP_SUPPORTED_SCOPES);
const normalUserScopeSet = new Set<string>(MCP_NORMAL_USER_SCOPES);

export function normalizeMcpScopes(input: unknown, fallback: readonly string[] = MCP_DEFAULT_SCOPES) {
  const raw = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? input.split(/\s+/)
      : fallback;

  const clean = raw
    .map((scope) => String(scope).trim())
    .filter((scope) => supportedScopeSet.has(scope));

  return Array.from(new Set(clean.length ? clean : fallback));
}

/**
 * Expand a set of scopes so that write scopes imply read scopes within the same section.
 * Example: plaivra.nutrition.write implies plaivra.nutrition.read
 * Does NOT cross sections: plaivra.nutrition.write does NOT imply plaivra.workouts.read
 */
export function expandMcpScopes(scopes: string[]): string[] {
  const expanded = new Set(scopes);

  // plaivra.full_access implies all normal user scopes
  if (expanded.has(MCP_SCOPES.fullAccess) || expanded.has(MCP_SCOPES.all)) {
    MCP_NORMAL_USER_SCOPES.forEach((s) => expanded.add(s));
  }

  // Section write implies section read
  const writeToReadMap: Record<string, string> = {
    [MCP_SCOPES.workoutsWrite]: MCP_SCOPES.workoutsRead,
    [MCP_SCOPES.nutritionWrite]: MCP_SCOPES.nutritionRead,
    [MCP_SCOPES.mealPlansWrite]: MCP_SCOPES.mealPlansRead,
    [MCP_SCOPES.hydrationWrite]: MCP_SCOPES.hydrationRead,
    [MCP_SCOPES.progressWrite]: MCP_SCOPES.progressRead,
    [MCP_SCOPES.wellnessWrite]: MCP_SCOPES.wellnessRead,
    [MCP_SCOPES.profileWrite]: MCP_SCOPES.profileRead,
    [MCP_SCOPES.settingsWrite]: MCP_SCOPES.settingsRead
  };

  for (const [writeScope, readScope] of Object.entries(writeToReadMap)) {
    if (expanded.has(writeScope)) {
      expanded.add(readScope);
    }
  }

  return Array.from(expanded);
}

/**
 * Check if a set of granted scopes includes a required scope, respecting
 * section-only write->read implication and full_access.
 */
export function hasScope(grantedScopes: string[], requiredScope: string): boolean {
  const expanded = new Set(expandMcpScopes(grantedScopes));
  return expanded.has(requiredScope);
}

/**
 * Check if any of the required scopes are present in the granted scopes.
 */
export function hasAnyScope(grantedScopes: string[], requiredScopes: string[]): boolean {
  const expanded = new Set(expandMcpScopes(grantedScopes));
  return requiredScopes.some((scope) => expanded.has(scope));
}

/**
 * Migrate old scope names to new canonical names.
 * Used for backward compatibility with chatgpt_connections.scopes that were
 * written before the AI Permissions feature.
 */
export function migrateLegacyScopes(scopes: string[]): string[] {
  const migrated = new Set<string>();

  for (const scope of scopes) {
    if (
      scope === "fitlife.all" ||
      scope === "fitlife.admin" ||
      scope === "fitlife.full_access" ||
      scope === MCP_SCOPES.admin ||
      scope === MCP_SCOPES.all ||
      scope === MCP_SCOPES.fullAccess
    ) {
      // Legacy blanket/admin scopes cannot prove explicit, current consent.
      // Drop them; section-level scopes in the same array are migrated below.
      continue;
    } else if (scope === "fitlife.training.write") {
      migrated.add(MCP_SCOPES.workoutsWrite);
      migrated.add(MCP_SCOPES.workoutsRead);
    } else if (scope === "fitlife.nutrition.write") {
      migrated.add(MCP_SCOPES.nutritionWrite);
      migrated.add(MCP_SCOPES.nutritionRead);
      migrated.add(MCP_SCOPES.mealPlansWrite);
      migrated.add(MCP_SCOPES.mealPlansRead);
      migrated.add(MCP_SCOPES.hydrationWrite);
      migrated.add(MCP_SCOPES.hydrationRead);
    } else if (scope === "fitlife.progress.write") {
      migrated.add(MCP_SCOPES.progressWrite);
      migrated.add(MCP_SCOPES.progressRead);
    } else if (scope === "fitlife.wellness.write") {
      migrated.add(MCP_SCOPES.wellnessWrite);
      migrated.add(MCP_SCOPES.wellnessRead);
    } else if (scope === "fitlife.profile.write") {
      migrated.add(MCP_SCOPES.profileWrite);
      migrated.add(MCP_SCOPES.profileRead);
    } else if (scope === "fitlife.profile.read") {
      migrated.add(MCP_SCOPES.profileRead);
    } else if (scope === "fitlife.summary.read") {
      // Legacy summary read was a generic read indicator. Map to profile read
      // and settings read as a safe fallback, since summary often included
      // dashboard-level data.
      migrated.add(MCP_SCOPES.profileRead);
      migrated.add(MCP_SCOPES.settingsRead);
    } else {
      // Generic migration: fitlife.* -> plaivra.* for all other canonical scopes
      const plaivraScope = scope.replace(/^fitlife\./, "plaivra.");
      if (plaivraScope !== scope && supportedScopeSet.has(plaivraScope)) {
        migrated.add(plaivraScope);
      } else if (supportedScopeSet.has(scope)) {
        // Already a plaivra scope (or valid scope)
        migrated.add(scope);
      }
    }
  }

  return normalizeMcpScopes(Array.from(migrated), []);
}

export function resolveSavedAiPermissionScopes(accessMode: unknown, input: unknown): string[] {
  const scopes = Array.isArray(input) ? input.map(String) : [];
  const hasBlockedBlanketScope = scopes.some((scope) =>
    [MCP_SCOPES.admin, MCP_SCOPES.all, "fitlife.admin", "fitlife.all", "fitlife.full_access"].includes(scope)
  );

  if (accessMode === "full") {
    if (hasBlockedBlanketScope || !scopes.includes(MCP_SCOPES.fullAccess)) return [];
    return expandMcpScopes([MCP_SCOPES.fullAccess, ...scopes.filter((scope) => normalUserScopeSet.has(scope))]);
  }

  if (accessMode === "custom") {
    return expandMcpScopes(scopes.filter((scope) => normalUserScopeSet.has(scope)));
  }

  return [];
}

/**
 * Determine if the granted scopes allow read access.
 * Read access is allowed if full_access is present, or any .read scope, or any .write scope (which implies .read in same section).
 */
export function readScopeAllowed(grantedScopes: string[]): boolean {
  const expanded = new Set(expandMcpScopes(grantedScopes));
  return (
    expanded.has(MCP_SCOPES.fullAccess) ||
    expanded.has(MCP_SCOPES.all) ||
    Array.from(expanded).some((scope) => scope.endsWith(".read") || scope.endsWith(".write"))
  );
}
