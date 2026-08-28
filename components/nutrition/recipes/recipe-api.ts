"use client";

import { env } from "@/lib/env";
import { supabase } from "@/lib/supabase/client";

const draftRevisionByRecipe = new Map<string, number>();

function recipeIdFromPath(path: string) {
  const value = path.replace(/^\/+/, "").split(/[/?#]/, 1)[0]?.trim();
  return value || null;
}

function rememberDraftRevision(path: string, body: Record<string, unknown>) {
  const recipeId = recipeIdFromPath(path);
  const recipe = body.recipe && typeof body.recipe === "object" && !Array.isArray(body.recipe)
    ? body.recipe as Record<string, unknown>
    : null;
  const draft = recipe?.draft && typeof recipe.draft === "object" && !Array.isArray(recipe.draft)
    ? recipe.draft as Record<string, unknown>
    : null;
  const revision = Number(draft?.revision);
  if (recipeId && Number.isInteger(revision) && revision >= 0) draftRevisionByRecipe.set(recipeId, revision);
}

function withExpectedDraftRevision(path: string, init: RequestInit) {
  if ((init.method ?? "GET").toUpperCase() !== "PATCH" || typeof init.body !== "string") return init;
  let requestBody: Record<string, unknown>;
  try {
    const parsed = JSON.parse(init.body) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return init;
    requestBody = parsed as Record<string, unknown>;
  } catch {
    return init;
  }
  if (requestBody.operation !== "autosave") return init;
  const recipeId = recipeIdFromPath(path);
  const expectedRevision = recipeId ? draftRevisionByRecipe.get(recipeId) : undefined;
  if (!recipeId || expectedRevision === undefined) {
    throw new Error("Recipe Working Draft revision is unavailable. Refresh the Draft before saving.");
  }
  requestBody.expectedRevision = expectedRevision;
  return { ...init, body: JSON.stringify(requestBody) };
}

export async function recipeApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!supabase) throw new Error("Recipe client is unavailable.");
  const renderedQa = env.useMockAuth && env.productionQaBuild;
  let authorization: string | null = null;
  if (!renderedQa) {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) throw new Error("Please sign in before using My Recipes.");
    authorization = `Bearer ${data.session.access_token}`;
  }
  const requestInit = withExpectedDraftRevision(path, init);
  const response = await fetch(`/api/nutrition/v1/recipes${path}`, {
    ...requestInit,
    headers: {
      ...(authorization ? { Authorization: authorization } : {}),
      ...(renderedQa ? { "x-plaivra-rendered-qa": "mock-auth" } : {}),
      ...(requestInit.body ? { "Content-Type": "application/json" } : {}),
      ...(requestInit.headers ?? {}),
    },
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Recipe request could not be completed.");
  rememberDraftRevision(path, body);
  return body as T;
}
