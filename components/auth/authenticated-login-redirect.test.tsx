// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  requestedNext: null as string | null,
  auth: {
    user: null as { id: string } | null,
    bootstrap: null as {
      userId: string;
      settings: { defaultStartPage: "today" | "train" };
    } | null,
    bootstrapStatus: "idle" as "idle" | "loading" | "ready" | "error",
    isLoading: false,
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => ({
    get: (key: string) => (key === "next" ? mocks.requestedNext : null),
  }),
}));
vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => mocks.auth,
}));
vi.mock("@/services/database/user-settings", () => ({
  defaultStartPageToPath: (value: string) =>
    value === "train" ? "/train" : "/dashboard",
}));

import {
  AuthenticatedLoginRedirect,
  resolveAuthenticatedLoginDestination,
} from "@/components/auth/authenticated-login-redirect";

const authPageSource = readFileSync(
  resolve(process.cwd(), "components/auth/auth-page.tsx"),
  "utf8",
);
const authFormSource = readFileSync(
  resolve(process.cwd(), "components/auth/auth-form.tsx"),
  "utf8",
);

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function renderRedirect() {
  await act(async () => {
    root!.render(<AuthenticatedLoginRedirect />);
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  mocks.replace.mockReset();
  mocks.requestedNext = null;
  mocks.auth.user = null;
  mocks.auth.bootstrap = null;
  mocks.auth.bootstrapStatus = "idle";
  mocks.auth.isLoading = false;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("authenticated login redirect recovery", () => {
  it("keeps unauthenticated and unresolved bootstrap states on the login page", async () => {
    await renderRedirect();
    expect(mocks.replace).not.toHaveBeenCalled();

    mocks.auth.user = { id: "11111111-1111-4111-8111-111111111111" };
    mocks.auth.bootstrapStatus = "loading";
    await renderRedirect();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("redirects only after the AuthProvider bootstrap authority is ready", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    mocks.auth.user = { id: userId };
    mocks.auth.bootstrapStatus = "ready";
    mocks.auth.bootstrap = {
      userId,
      settings: { defaultStartPage: "train" },
    };

    await renderRedirect();

    expect(mocks.replace).toHaveBeenCalledTimes(1);
    expect(mocks.replace).toHaveBeenCalledWith("/train");
  });

  it("honours a safe explicit next route as soon as the provider owns the user", async () => {
    mocks.requestedNext = "/workout-history";
    mocks.auth.user = { id: "11111111-1111-4111-8111-111111111111" };
    mocks.auth.bootstrapStatus = "loading";

    await renderRedirect();

    expect(mocks.replace).toHaveBeenCalledWith("/workout-history");
  });

  it("prevents auth-entry loops and unsafe external redirects", () => {
    expect(
      resolveAuthenticatedLoginDestination("/login?next=%2Fdashboard", "/dashboard"),
    ).toBe("/dashboard");
    expect(
      resolveAuthenticatedLoginDestination("/register", "/dashboard"),
    ).toBe("/dashboard");
    expect(
      resolveAuthenticatedLoginDestination("/auth/consent-completion", "/dashboard"),
    ).toBe("/dashboard");
    expect(
      resolveAuthenticatedLoginDestination("https://example.com", "/dashboard"),
    ).toBe("/dashboard");
  });

  it("keeps email-login navigation under the authenticated recovery authority", () => {
    const loginStart = authFormSource.indexOf(
      'if (mode === "login") {\n        const { data, error } = await withAuthTimeout',
    );
    const registrationStart = authFormSource.indexOf(
      '\n      } else {\n        const { data, error } = await withAuthTimeout(supabase.auth.signUp',
      loginStart,
    );

    expect(loginStart).toBeGreaterThanOrEqual(0);
    expect(registrationStart).toBeGreaterThan(loginStart);
    const loginBranch = authFormSource.slice(loginStart, registrationStart);
    expect(loginBranch).not.toContain("getUserAppSettings");
    expect(loginBranch).not.toContain("router.replace");
    expect(loginBranch).not.toContain("router.refresh");
    expect(authFormSource).not.toContain(
      'from "@/services/database/user-settings"',
    );
  });

  it("mounts recovery only for login, not registration", () => {
    expect(authPageSource).toContain(
      'mode === "login" ? <AuthenticatedLoginRedirect /> : null',
    );
  });
});
