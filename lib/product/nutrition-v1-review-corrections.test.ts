import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { cookingLocalStorageKey } from "@/lib/nutrition-v1/cooking-local-store";

const root = process.cwd();
const source = (path: string) => readFileSync(join(root, path), "utf8");
const cookingModePath = "components/nutrition/cooking/cooking-mode.tsx";
const loggingSessionPath = "components/nutrition/diary/logging-session.tsx";

const userId = "11111111-1111-4111-8111-111111111111";
const recipeId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("Nutrition V1 review privacy and recovery corrections", () => {
  it("scopes Cooking recovery storage to the authenticated owner", () => {
    const key = (cookingLocalStorageKey as unknown as (ownerId: string, recipeId: string) => string)(userId, recipeId);
    expect(key).toBe(`plaivra:nutrition:cooking:${userId}:${recipeId}:active`);

    const mode = source(cookingModePath);
    const initialize = mode.indexOf("const initialize");
    const authenticate = mode.indexOf("supabase.auth.getUser()", initialize);
    const recover = mode.indexOf("recoverCookingLocalSession", initialize);
    expect(initialize).toBeGreaterThanOrEqual(0);
    expect(authenticate).toBeGreaterThan(initialize);
    expect(recover).toBeGreaterThan(authenticate);
    expect(mode).toContain("cookingLocalStorageKey(ownerId, recipeId)");
  });

  it("retries queued terminal Cooking transitions instead of excluding non-active local sessions", () => {
    const mode = source(cookingModePath);
    const start = mode.indexOf("const flushPending");
    const end = mode.indexOf("const onResume", start);
    const flush = mode.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(flush).not.toContain('candidate.status !== "active"');
    expect(flush).toContain('"complete_session"');
    expect(flush).toContain('"end_session"');
    expect(flush).toContain("completeCookingSession");
    expect(flush).toContain("endCookingSession");
  });

  it("scopes bounded Diary Plate recovery to the authenticated owner", () => {
    const logging = source(loggingSessionPath);
    expect(logging).toMatch(/const\s+userId\s*=\s*session\?\.user\.id/);
    expect(logging).toMatch(/draftKey\(userId,\s*date,\s*meal/);
    expect(logging).toMatch(/if\s*\(!userId\)\s*return/);
  });
});
