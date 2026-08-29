export function normalizeOwnedRecipeCoverPath(userId: string, value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;

  const path = value.trim();
  if (!path) return null;
  const segments = path.split("/");
  if (segments[0] !== userId || segments.length < 2 || segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("Recipe cover path must belong to the authenticated owner.");
  }
  return path;
}
