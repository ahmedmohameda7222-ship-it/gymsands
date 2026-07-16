import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock("@/lib/supabase/client", () => ({ supabase: { auth: { getSession: mocks.getSession } } }));
vi.mock("@/lib/env", () => ({ env: { useMockAuth: false } }));

import { searchCatalogActivities } from "./client";

describe("Activity Catalog client cancellation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: "member-token" } } });
  });

  it("passes the supplied AbortSignal to fetch and preserves AbortError", async () => {
    const controller = new AbortController();
    vi.stubGlobal("fetch", vi.fn((_path: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (signal?.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    })));

    const request = searchCatalogActivities({ limit: 60, offset: 0 }, {
      requestGroupId: "exercise-picker-generation",
      signal: controller.signal
    });
    await Promise.resolve();
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ signal: controller.signal }));
  });
});
