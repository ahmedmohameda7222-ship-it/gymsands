import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock("@/lib/supabase/client", () => ({
  supabase: { auth: { getSession: mocks.getSession } },
}));
vi.mock("@/lib/env", () => ({
  env: { useMockAuth: false, productionQaBuild: false },
}));

import { recipeApi } from "@/components/nutrition/recipes/recipe-api";

function workspaceResponse(revision: number) {
  return new Response(JSON.stringify({ recipe: { draft: { revision } } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("Recipe API autosave concurrency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: "member-token" } },
      error: null,
    });
  });

  it("serializes same-editor autosaves so the newer intent uses the revision returned by the older save", async () => {
    const recipeId = "11111111-1111-4111-8111-111111111111";
    let resolveFirstAutosave!: (response: Response) => void;
    let autosaveCalls = 0;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "GET") return workspaceResponse(0);

      autosaveCalls += 1;
      if (autosaveCalls === 1) {
        return await new Promise<Response>((resolve) => {
          resolveFirstAutosave = resolve;
        });
      }
      return workspaceResponse(2);
    });
    vi.stubGlobal("fetch", fetchMock);

    await recipeApi(`/${recipeId}`);

    const firstSave = recipeApi(`/${recipeId}`, {
      method: "PATCH",
      body: JSON.stringify({ operation: "autosave", draft: { name: "Older intent" } }),
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const secondSave = recipeApi(`/${recipeId}`, {
      method: "PATCH",
      body: JSON.stringify({ operation: "autosave", draft: { name: "Newer intent" } }),
    });
    await Promise.resolve();
    await Promise.resolve();

    try {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      resolveFirstAutosave(workspaceResponse(1));
      await Promise.allSettled([firstSave, secondSave]);
    }

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const secondAutosaveBody = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body)) as Record<string, unknown>;
    expect(secondAutosaveBody.expectedRevision).toBe(1);
  });

  it("preserves HTTP status and stable error code for a Recipe revision conflict", async () => {
    const recipeId = "22222222-2222-4222-8222-222222222222";
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      if ((init?.method ?? "GET").toUpperCase() === "GET") return workspaceResponse(3);
      return new Response(JSON.stringify({
        error: "Recipe Working Draft revision conflict.",
        code: "recipe_draft_revision_conflict",
      }), {
        status: 409,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await recipeApi(`/${recipeId}`);

    const save = recipeApi(`/${recipeId}`, {
      method: "PATCH",
      body: JSON.stringify({ operation: "autosave", draft: { name: "Local intent" } }),
    });

    await expect(save).rejects.toMatchObject({
      status: 409,
      code: "recipe_draft_revision_conflict",
      message: "Recipe Working Draft revision conflict.",
    });
  });
});
