import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ownerId = "11111111-1111-4111-8111-111111111111";
const browserSuppliedOwnerId = "22222222-2222-4222-8222-222222222222";

const { requireUser } = vi.hoisted(() => ({ requireUser: vi.fn() }));

vi.mock("@/lib/integrations/env", () => ({ requireUser }));

import {
  nutritionJson,
  requireNutritionUser,
} from "@/lib/nutrition-v1/http";
import {
  NutritionRequestError,
  nutritionErrorResponse,
} from "@/services/nutrition-v1/server/errors";

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({
    supabase: { identity: "rls-client" },
    user: { id: ownerId },
    accessToken: "owner-token",
  });
});

describe("Nutrition V1 authenticated HTTP foundation", () => {
  it("delegates to the existing auth authority and never trusts a browser owner hint", async () => {
    const request = new Request(
      `https://app.plaivra.com/api/nutrition/v1/test?userId=${browserSuppliedOwnerId}`,
      {
        headers: {
          Authorization: "Bearer owner-token",
          "x-user-id": browserSuppliedOwnerId,
        },
      },
    );

    const context = await requireNutritionUser(request);

    expect(requireUser).toHaveBeenCalledOnce();
    expect(requireUser).toHaveBeenCalledWith(request);
    expect(context).not.toBeInstanceOf(NextResponse);
    if (context instanceof NextResponse) throw new Error("Expected authenticated context.");
    expect(context.user.id).toBe(ownerId);
    expect(context.user.id).not.toBe(browserSuppliedOwnerId);
  });

  it("preserves auth failures while enforcing private no-store response headers", async () => {
    requireUser.mockResolvedValue(
      NextResponse.json({ error: "Your session expired." }, { status: 401 }),
    );
    const response = await requireNutritionUser(
      new Request("https://app.plaivra.com/api/nutrition/v1/test"),
    );

    expect(response).toBeInstanceOf(NextResponse);
    if (!(response instanceof NextResponse)) throw new Error("Expected auth response.");
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("Vary")).toBe("Authorization");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("applies the shared private response policy to successful JSON", async () => {
    const response = nutritionJson({ ok: true });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("Vary")).toBe("Authorization");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("maps bounded validation failures to a safe 400 response", async () => {
    const response = nutritionErrorResponse(
      new NutritionRequestError("Meal date is invalid."),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Meal date is invalid.",
      code: "nutrition_request_invalid",
    });
  });

  it("sanitizes unexpected server failures without leaking implementation details", async () => {
    const response = nutritionErrorResponse(
      new Error("relation private_nutrition_secret token=do-not-leak"),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: "Nutrition request could not be completed.",
      code: "nutrition_unavailable",
    });
    expect(JSON.stringify(body)).not.toMatch(/relation|private_nutrition_secret|token=|do-not-leak/i);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });
});
