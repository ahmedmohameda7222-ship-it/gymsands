export const MCP_SCOPES = {
  profileRead: "fitlife.profile.read",
  profileWrite: "fitlife.profile.write",
  summaryRead: "fitlife.summary.read",
  nutritionWrite: "fitlife.nutrition.write",
  trainingWrite: "fitlife.training.write",
  progressWrite: "fitlife.progress.write",
  wellnessWrite: "fitlife.wellness.write",
  admin: "fitlife.admin",
  all: "fitlife.all"
} as const;

export const MCP_SUPPORTED_SCOPES = [
  MCP_SCOPES.profileRead,
  MCP_SCOPES.profileWrite,
  MCP_SCOPES.summaryRead,
  MCP_SCOPES.nutritionWrite,
  MCP_SCOPES.trainingWrite,
  MCP_SCOPES.progressWrite,
  MCP_SCOPES.wellnessWrite,
  MCP_SCOPES.admin,
  MCP_SCOPES.all
];

export const MCP_DEFAULT_SCOPES = [
  MCP_SCOPES.profileRead,
  MCP_SCOPES.summaryRead,
  MCP_SCOPES.nutritionWrite,
  MCP_SCOPES.trainingWrite,
  MCP_SCOPES.progressWrite,
  MCP_SCOPES.wellnessWrite
];

const supportedScopeSet = new Set<string>(MCP_SUPPORTED_SCOPES);

export function normalizeMcpScopes(input: unknown, fallback = MCP_DEFAULT_SCOPES) {
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
