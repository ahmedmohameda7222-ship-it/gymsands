import { describe, expect, it, vi } from "vitest";

import {
  PrivateAppBootstrapMemoryCache,
  normalizePrivateAppBootstrapPayload,
  type PrivateAppBootstrap,
} from "@/lib/auth/private-app-bootstrap";
import {
  evaluateUserLaunchEligibility,
  ELIGIBILITY_ERROR_CODES,
} from "@/lib/auth/eligibility";
import { REQUIRED_CONSENTS } from "@/lib/legal/versions";
import { evaluateRequiredConsents } from "@/services/database/consents";

const userId = "11111111-1111-4111-8111-111111111111";

function payload(overrides: Record<string, unknown> = {}) {
  return {
    contractVersion: 1,
    userId,
    profile: {
      id: userId,
      email: "member@example.test",
      full_name: "Member",
      role: "member",
      avatar_url: null,
      created_at: "2026-08-03T00:00:00.000Z",
      updated_at: "2026-08-03T00:00:00.000Z",
    },
    accountAccessState: "active",
    consentRecords: REQUIRED_CONSENTS.map((record) => ({
      ...record,
      granted: true,
      revoked_at: null,
    })),
    onboarding: {
      age: 25,
      completed_at: "2026-08-03T00:00:00.000Z",
    },
    settings: null,
    ...overrides,
  };
}

function bootstrap(id = userId): PrivateAppBootstrap {
  return normalizePrivateAppBootstrapPayload(
    payload({
      userId: id,
      profile: {
        ...(payload().profile as Record<string, unknown>),
        id,
      },
    }),
    id,
  );
}

describe("private app bootstrap normalization", () => {
  it("normalizes owner-scoped facts and existing settings defaults", () => {
    const result = normalizePrivateAppBootstrapPayload(payload(), userId);
    expect(result.userId).toBe(userId);
    expect(result.hasRequiredConsents).toBe(true);
    expect(result.onboardingComplete).toBe(true);
    expect(result.eligibility).toEqual({ eligible: true });
    expect(result.settings.userId).toBe(userId);
  });

  it("rejects malformed contract versions and mismatched identities", () => {
    expect(() =>
      normalizePrivateAppBootstrapPayload(payload({ contractVersion: 2 }), userId),
    ).toThrow(/contract version/i);
    expect(() =>
      normalizePrivateAppBootstrapPayload(
        payload({ userId: "22222222-2222-4222-8222-222222222222" }),
        userId,
      ),
    ).toThrow(/does not match/i);
    expect(() =>
      normalizePrivateAppBootstrapPayload(
        payload({
          profile: {
            ...(payload().profile as Record<string, unknown>),
            id: "22222222-2222-4222-8222-222222222222",
          },
        }),
        userId,
      ),
    ).toThrow(/ownership/i);
  });
});

describe("shared product-rule evaluators", () => {
  it("evaluates required consent versions and revocation", () => {
    const granted = REQUIRED_CONSENTS.map((record) => ({
      ...record,
      granted: true,
      revoked_at: null,
    }));
    expect(evaluateRequiredConsents(granted)).toBe(true);
    expect(
      evaluateRequiredConsents([
        ...granted.slice(0, -1),
        { ...granted.at(-1)!, revoked_at: "2026-08-03T00:00:00.000Z" },
      ]),
    ).toBe(false);
  });

  it("preserves eligibility review and verification-failure behavior", () => {
    expect(
      evaluateUserLaunchEligibility({
        ageConfirmationConsent: { granted: true, revoked_at: null },
        onboardingAge: 25,
      }),
    ).toEqual({ eligible: true });
    expect(
      evaluateUserLaunchEligibility({
        ageConfirmationConsent: null,
        onboardingAge: 25,
      }),
    ).toMatchObject({
      eligible: false,
      code: ELIGIBILITY_ERROR_CODES.reviewRequired,
    });
    expect(
      evaluateUserLaunchEligibility({
        ageConfirmationConsent: { granted: true, revoked_at: null },
        onboardingAge: null,
        verificationFailed: true,
      }),
    ).toMatchObject({
      eligible: false,
      code: ELIGIBILITY_ERROR_CODES.verificationFailed,
    });
  });
});

describe("private bootstrap memory cache", () => {
  it("deduplicates concurrent requests and reuses ready data for navigation", async () => {
    const cache = new PrivateAppBootstrapMemoryCache();
    let resolveRequest!: (value: PrivateAppBootstrap) => void;
    const loader = vi.fn(
      () =>
        new Promise<PrivateAppBootstrap>((resolve) => {
          resolveRequest = resolve;
        }),
    );

    const first = cache.load(userId, loader);
    const concurrent = cache.load(userId, loader);
    expect(loader).toHaveBeenCalledTimes(1);
    resolveRequest(bootstrap());
    await expect(Promise.all([first, concurrent])).resolves.toHaveLength(2);

    await cache.load(userId, loader);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("allows one bounded retry after a failure", async () => {
    const cache = new PrivateAppBootstrapMemoryCache();
    const loader = vi
      .fn<() => Promise<PrivateAppBootstrap>>()
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce(bootstrap());

    await expect(cache.load(userId, loader)).rejects.toThrow("temporary failure");
    await expect(cache.load(userId, loader, { force: true })).resolves.toMatchObject({
      userId,
    });
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
