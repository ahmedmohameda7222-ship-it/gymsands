import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

vi.mock("@/lib/env", () => ({
  env: { useMockAuth: true, productionQaBuild: true },
}));

vi.mock("@/lib/supabase/client", () => ({
  supabase: {},
}));

const recipeId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function responseWithDraftRevision(revision?: number) {
  return new Response(JSON.stringify({
    recipe: {
      root: { id: recipeId },
      draft: {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        ...(revision === undefined ? {} : { revision }),
      },
    },
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

function autosave(name: string) {
  return {
    method: "PATCH",
    body: JSON.stringify({ operation: "autosave", draft: { name } }),
  } satisfies RequestInit;
}

describe("recipeApi Draft revision authority", () => {
  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the latest confirmed server revision for each subsequent autosave", async () => {
    fetchMock
      .mockResolvedValueOnce(responseWithDraftRevision(4))
      .mockResolvedValueOnce(responseWithDraftRevision(5))
      .mockResolvedValueOnce(responseWithDraftRevision(6));

    const { recipeApi } = await import("@/components/nutrition/recipes/recipe-api");
    await recipeApi(`/${recipeId}`);
    await recipeApi(`/${recipeId}`, autosave("First"));
    await recipeApi(`/${recipeId}`, autosave("Second"));

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const firstBody = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body)) as { expectedRevision?: number };
    const secondBody = JSON.parse(String((fetchMock.mock.calls[2]?.[1] as RequestInit).body)) as { expectedRevision?: number };
    expect(firstBody.expectedRevision).toBe(4);
    expect(secondBody.expectedRevision).toBe(5);
  });

  it("fails closed when the authoritative Draft revision is unavailable", async () => {
    fetchMock
      .mockResolvedValueOnce(responseWithDraftRevision())
      .mockResolvedValueOnce(responseWithDraftRevision(1));

    const { recipeApi } = await import("@/components/nutrition/recipes/recipe-api");
    await recipeApi(`/${recipeId}`);

    await expect(recipeApi(`/${recipeId}`, autosave("Changed"))).rejects.toThrow(
      "Recipe Working Draft revision is unavailable. Refresh the Draft before saving.",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
