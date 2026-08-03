// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  routerReplace: vi.fn(),
  refreshBootstrap: vi.fn(),
  rawError: new Error("permission denied for relation profiles"),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ replace: mocks.routerReplace }),
}));
vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "11111111-1111-4111-8111-111111111111" },
    bootstrap: null,
    bootstrapStatus: "error",
    bootstrapError: mocks.rawError,
    isLoading: false,
    refreshBootstrap: mocks.refreshBootstrap,
  }),
}));
vi.mock("@/components/observability/performance-reporter", () => ({
  AuthenticatedAppBootReporter: () => null,
}));
vi.mock("@/lib/auth/private-route-gate", () => ({
  resolvePrivateRouteGate: () => ({ kind: "bootstrap-error" }),
}));

import { ProtectedRoute } from "@/components/auth/protected-route";

const protectedRoute = readFileSync(
  resolve(process.cwd(), "components/auth/protected-route.tsx"),
  "utf8",
);
const consentCompletion = readFileSync(
  resolve(process.cwd(), "components/auth/consent-completion-client.tsx"),
  "utf8",
);
const onboardingForm = readFileSync(
  resolve(process.cwd(), "components/onboarding/adaptive-onboarding-form.tsx"),
  "utf8",
);

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  mocks.routerReplace.mockReset();
  mocks.refreshBootstrap.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  vi.restoreAllMocks();
  if (root) {
    await act(async () => root!.unmount());
  }
  container?.remove();
  root = null;
  container = null;
});

describe("PCS-2 route consumers", () => {
  it("keeps ProtectedRoute deterministic and database-free", () => {
    expect(protectedRoute).toContain("resolvePrivateRouteGate");
    expect(protectedRoute).not.toContain("getOnboarding");
    expect(protectedRoute).not.toContain("hasRequiredConsents");
    expect(protectedRoute).not.toContain("checkUserLaunchEligibility");
    expect(protectedRoute).not.toContain("@/lib/supabase/client");
    expect(protectedRoute).not.toContain("window.location.reload");
    expect(protectedRoute).toContain("refreshBootstrap");
    expect(protectedRoute.match(/useEffect\(/g)).toHaveLength(1);
  });

  it("renders one safe bootstrap error and consumes repeated retry rejections", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const unhandled = vi.fn();
    window.addEventListener("unhandledrejection", unhandled);
    mocks.refreshBootstrap.mockRejectedValue(mocks.rawError);

    await act(async () => {
      root!.render(
        <ProtectedRoute>
          <div>Member content</div>
        </ProtectedRoute>,
      );
    });

    expect(container!.textContent).toContain(
      "Plaivra could not verify your account. Retry before opening member features.",
    );
    expect(container!.textContent).not.toContain(mocks.rawError.message);

    const firstRetry = Array.from(container!.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Retry account check"),
    );
    expect(firstRetry).toBeTruthy();

    await act(async () => {
      firstRetry!.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();

    expect(mocks.refreshBootstrap).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith(
      "Plaivra private bootstrap retry failed.",
      mocks.rawError,
    );
    expect(unhandled).not.toHaveBeenCalled();

    const secondRetry = Array.from(container!.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Retry account check"),
    );
    expect(secondRetry).toBeTruthy();
    expect((secondRetry as HTMLButtonElement).disabled).toBe(false);

    await act(async () => {
      secondRetry!.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();

    expect(mocks.refreshBootstrap).toHaveBeenCalledTimes(2);
    expect(unhandled).not.toHaveBeenCalled();
    expect(
      Array.from(container!.querySelectorAll("button")).some(
        (button) =>
          button.textContent?.includes("Retry account check") &&
          !(button as HTMLButtonElement).disabled,
      ),
    ).toBe(true);

    window.removeEventListener("unhandledrejection", unhandled);
  });

  it("refreshes bootstrap after consent persistence before navigation", () => {
    const saveIndex = consentCompletion.indexOf(
      "await saveRequiredConsents(session.access_token, ageResult.data);",
    );
    const refreshIndex = consentCompletion.indexOf("await refreshBootstrap();");
    const navigationIndex = consentCompletion.indexOf(
      "router.replace(next);",
      refreshIndex,
    );
    expect(saveIndex).toBeGreaterThan(-1);
    expect(refreshIndex).toBeGreaterThan(saveIndex);
    expect(navigationIndex).toBeGreaterThan(refreshIndex);
    expect(consentCompletion).not.toContain(
      'from "@/services/database/consents"',
    );
    expect(consentCompletion).not.toContain("await hasRequiredConsents(");
  });

  it("awaits onboarding bootstrap refresh before destination navigation", () => {
    const refreshIndex = onboardingForm.indexOf("await refreshProfile();");
    const navigationIndex = onboardingForm.indexOf(
      'router.push(editMode ? safeReturnTo : "/dashboard")',
      refreshIndex,
    );
    expect(refreshIndex).toBeGreaterThan(-1);
    expect(navigationIndex).toBeGreaterThan(refreshIndex);
  });
});
