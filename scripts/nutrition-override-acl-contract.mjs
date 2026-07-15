export const REQUIRED_NUTRITION_OVERRIDE_AUTHENTICATED_PRIVILEGES = Object.freeze([
  "DELETE",
  "INSERT",
  "SELECT",
  "UPDATE"
]);

export const FORBIDDEN_NUTRITION_OVERRIDE_AUTHENTICATED_PRIVILEGES = Object.freeze([
  "MAINTAIN",
  "REFERENCES",
  "TRIGGER",
  "TRUNCATE"
]);

export function evaluateNutritionOverrideAuthenticatedAcl(privileges) {
  const normalized = [...new Set(
    (Array.isArray(privileges) ? privileges : [])
      .filter((privilege) => typeof privilege === "string")
      .map((privilege) => privilege.trim().toUpperCase())
      .filter(Boolean)
  )].sort();

  const expected = [...REQUIRED_NUTRITION_OVERRIDE_AUTHENTICATED_PRIVILEGES].sort();
  const missing = expected.filter((privilege) => !normalized.includes(privilege));
  const excess = normalized.filter((privilege) => !expected.includes(privilege));
  const forbidden = FORBIDDEN_NUTRITION_OVERRIDE_AUTHENTICATED_PRIVILEGES.filter(
    (privilege) => normalized.includes(privilege)
  );

  return {
    privileges: normalized,
    missing,
    excess,
    forbidden,
    exact: missing.length === 0 && excess.length === 0
  };
}
