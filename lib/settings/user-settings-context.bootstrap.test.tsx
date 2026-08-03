// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  value: null as null | Record<string, unknown>,
}));
const toast = vi.hoisted(() => vi.fn());

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => authState.value,
}));
vi.mock("@/components/ui/toaster", () => ({
  useToast: () => ({ toast }),
}));
vi.mock("@/lib/i18n/client-language-preference", () => ({
  readStoredLanguagePreference: () => null,
}));
vi.mock("@/services/database/user-settings", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/services/database/user-settings")
  >();
  return {
    ...actual,
    getUserAppSettings: vi.fn(() => {
      throw new Error("normal bootstrap must not call getUserAppSettings");
    }),
    upsertUserAppSettings: vi.fn(async (userId, patch) =>
      actual.normalizeUserAppSettings(
        { ...actual.defaultUserAppSettings, ...patch },
        userId,
      ),
    ),
    resetUserAppSettings: vi.fn(async (userId) =>
      actual.normalizeUserAppSettings(actual.defaultUserAppSettings, userId),
    ),
  };
});

import {
  UserSettingsProvider,
  useUserSettings,
} from "@/lib/settings/user-settings-context";
import {
  defaultUserAppSettings,
  normalizeUserAppSettings,
} from "@/services/database/user-settings";

const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";
let latest: ReturnType<typeof useUserSettings> | null = null;
let root: Root | null = null;
let container: HTMLDivElement | null = null;

function Probe() {
  latest = useUserSettings();
  return <div data-language={latest.settings.language} />;
}

function authValue(userId: string, language: "en" | "de" | "ar") {
  return {
    user: { id: userId },
    isLoading: false,
    bootstrapStatus: "ready",
    bootstrapError: null,
    bootstrap: {
      userId,
      settings: normalizeUserAppSettings(
        { ...defaultUserAppSettings, language },
        userId,
      ),
    },
  };
}

async function renderProvider() {
  await act(async () => {
    root!.render(
      <UserSettingsProvider initialLanguagePreference="en">
        <Probe />
      </UserSettingsProvider>,
    );
  });
}

beforeEach(() => {
  window.localStorage.clear();
  toast.mockClear();
  authState.value = authValue(userA, "de");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  latest = null;
  root = null;
  container = null;
});

describe("UserSettingsProvider bootstrap hydration", () => {
  it("hydrates initial authenticated settings without a settings read", async () => {
    await renderProvider();
    expect(latest?.settings.userId).toBe(userA);
    expect(latest?.settings.language).toBe("de");
    expect(latest?.isLoadingSettings).toBe(false);
  });

  it("replaces settings atomically for a new user and accepts later refreshes", async () => {
    await renderProvider();
    authState.value = authValue(userB, "ar");
    await renderProvider();
    expect(latest?.settings.userId).toBe(userB);
    expect(latest?.settings.language).toBe("ar");

    authState.value = authValue(userB, "en");
    await renderProvider();
    expect(latest?.settings.userId).toBe(userB);
    expect(latest?.settings.language).toBe("en");
  });

  it("restores public device defaults on sign-out", async () => {
    await renderProvider();
    authState.value = {
      user: null,
      isLoading: false,
      bootstrap: null,
      bootstrapStatus: "idle",
      bootstrapError: null,
    };
    await renderProvider();
    expect(latest?.settings.userId).toBe("");
    expect(latest?.isLoadingSettings).toBe(false);
  });
});
