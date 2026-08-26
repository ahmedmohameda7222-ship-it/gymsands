import { NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
}));

vi.mock("@/lib/integrations/env", () => ({
  requireUser: mocks.requireUser,
}));

import { GET } from "@/app/api/nutrition/v1/diary/route";

const QA_TOKEN = "plaivra-rendered-qa-access-token";
const originalMockAuth = process.env.NEXT_PUBLIC_USE_MOCK_AUTH;
const originalProductionQa = process.env.NEXT_PUBLIC_PLAIVRA_PRODUCTION_QA;
const originalQaBuildValue = process.env.QA_MOCK_AUTH_BUILD_VALUE;

function request(token = QA_TOKEN) {
  return new Request("https://app.plaivra.com/api/nutrition/v1/diary?date=2026-08-26", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_USE_MOCK_AUTH = "true";
  process.env.NEXT_PUBLIC_PLAIVRA_PRODUCTION_QA = "true";
  process.env.QA_MOCK_AUTH_BUILD_VALUE = "true";
  mocks.requireUser.mockResolvedValue(
    NextResponse.json({ error: "unexpected outbound auth" }, { status: 503 }),
  );
});

afterEach(() => {
  if (originalMockAuth === undefined) delete process.env.NEXT_PUBLIC_USE_MOCK_AUTH;
  else process.env.NEXT_PUBLIC_USE_MOCK_AUTH = originalMockAuth;
  if (originalProductionQa === undefined) delete process.env.NEXT_PUBLIC_PLAIVRA_PRODUCTION_QA;
  else process.env.NEXT_PUBLIC_PLAIVRA_PRODUCTION_QA = originalProductionQa;
  if (originalQaBuildValue === undefined) delete process.env.QA_MOCK_AUTH_BUILD_VALUE;
  else process.env.QA_MOCK_AUTH_BUILD_VALUE = originalQaBuildValue;
});

describe("GET /api/nutrition/v1/diary rendered-QA isolation", () => {
  it("serves a deterministic private Diary fixture without outbound auth in explicit rendered QA", async () => {
    const response = await GET(request());
    const body = await response.json() as Record<string, any>;

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
    expect(body.date).toBe("2026-08-26");
    expect(body.domains.actual.status).toBe("ready");
    expect(body.domains.target.status).toBe("ready");
    expect(body.domains.hydration.status).toBe("ready");
    expect(body.domains.planned.status).toBe("ready");
    expect(body.position.actual.caloriesKcal).toBeGreaterThan(0);
    expect(mocks.requireUser).not.toHaveBeenCalled();
  });

  it("does not accept the QA token as an auth bypass outside an explicit QA build", async () => {
    delete process.env.NEXT_PUBLIC_PLAIVRA_PRODUCTION_QA;
    delete process.env.QA_MOCK_AUTH_BUILD_VALUE;

    const response = await GET(request());

    expect(response.status).toBe(503);
    expect(mocks.requireUser).toHaveBeenCalledOnce();
  });
});
