import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

vi.mock("@/lib/env", () => ({
  env: { useMockAuth: true, productionQaBuild: true },
}));

vi.mock("@/lib/supabase/client", () => ({
  supabase: {},
}));

describe("recipeApi rendered QA revision seed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("seeds a deterministic mock revision when the rendered-QA Draft fixture predates revision CAS", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({
        recipe: {
          root: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
          draft: { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        recipe: {
          root: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
          draft: { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", revision: 1 },
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const { recipeApi } = await import("@/components/nutrition/recipes/recipe-api");
    await recipeApi("/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    await recipeApi("/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", {
      method: "PATCH",
      body: JSON.stringify({ operation: "autosave", draft: { name: "Changed" } }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const autosaveRequest = fetchMock.mock.calls[1]?.[1] as RequestInit;
    const body = JSON.parse(String(autosaveRequest.body)) as { expectedRevision?: number };
    expect(body.expectedRevision).toBe(0);
  });
});
