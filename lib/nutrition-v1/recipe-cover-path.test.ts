import { describe, expect, it } from "vitest";

import { normalizeOwnedRecipeCoverPath } from "@/lib/nutrition-v1/recipe-cover-path";

const owner = "11111111-1111-4111-8111-111111111111";

describe("Nutrition V1 Recipe cover ownership", () => {
  it("accepts only object paths rooted under the authenticated owner", () => {
    expect(normalizeOwnedRecipeCoverPath(owner, `${owner}/recipes/cover.webp`)).toBe(`${owner}/recipes/cover.webp`);
    expect(normalizeOwnedRecipeCoverPath(owner, "   ")).toBeNull();
    expect(normalizeOwnedRecipeCoverPath(owner, null)).toBeNull();
    expect(normalizeOwnedRecipeCoverPath(owner, undefined)).toBeUndefined();
  });

  it("rejects foreign and traversal-like paths before persistence", () => {
    expect(() => normalizeOwnedRecipeCoverPath(owner, "22222222-2222-4222-8222-222222222222/cover.webp")).toThrow(/authenticated owner/i);
    expect(() => normalizeOwnedRecipeCoverPath(owner, `${owner}/../22222222-2222-4222-8222-222222222222/cover.webp`)).toThrow(/authenticated owner/i);
    expect(() => normalizeOwnedRecipeCoverPath(owner, `${owner}//cover.webp`)).toThrow(/authenticated owner/i);
  });
});
