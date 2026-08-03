// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ownerId = "11111111-1111-4111-8111-111111111111";

const mocks = vi.hoisted(() => ({
  auth: {
    user: { id: "11111111-1111-4111-8111-111111111111" },
    profile: null,
    session: { access_token: "progress-token-a" },
    refreshProfile: vi.fn(),
  } as {
    user: { id: string } | null;
    profile: null;
    session: { access_token: string } | null;
    refreshProfile: ReturnType<typeof vi.fn>;
  },
  canonical: vi.fn(),
  progress: vi.fn(),
  nutrition: vi.fn(),
  retry: null as (() => void) | null,
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => mocks.auth,
}));
vi.mock("@/lib/settings/user-settings-context", () => ({
  useUserSettings: () => ({ settings: { hideProgressPhotos: true } }),
}));
vi.mock("@/components/ui/toaster", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));
vi.mock("@/components/ui/confirm-dialog", () => ({
  useConfirm: () => ({ dialog: null, ask: vi.fn() }),
}));
vi.mock("@/lib/hooks/use-today-date", () => ({
  useTodayDate: () => "2026-08-03",
}));
vi.mock("@/services/database/progress", () => ({
  getProgressEntries: mocks.progress,
}));
vi.mock("@/services/database/nutrition", () => ({
  getNutritionWeek: mocks.nutrition,
}));
vi.mock("@/services/database/profile", () => ({
  updateProfile: vi.fn(),
}));
vi.mock("@/services/workouts/history/client", () => ({
  getCanonicalWorkoutActivity: mocks.canonical,
}));
vi.mock("@/services/progress/progress-measurements", () => ({
  deleteProgressEntryWithMeasurements: vi.fn(),
  updateProgressEntryWithMeasurements: vi.fn(),
}));
vi.mock("@/services/progress/progress-photos", () => ({
  deleteProgressPhoto: vi.fn(),
  getProgressPhotos: vi.fn(),
  uploadProgressPhoto: vi.fn(),
  validateProgressPhotoFile: vi.fn(),
}));

vi.mock("@/components/layout/page-heading", () => ({
  PageHeading: () => <header />,
}));
vi.mock("@/components/ui/state-views", () => ({
  CardGridSkeleton: () => <div data-loading />,
  ErrorState: ({ onRetry }: { onRetry?: () => void }) => {
    mocks.retry = onRetry ?? null;
    return <button data-progress-retry onClick={onRetry} />;
  },
}));
vi.mock("@/components/progress/progress-entry-modal", () => ({
  ProgressEntryModal: () => <button />,
}));
vi.mock("@/components/progress/progress-charts", () => ({
  ProgressCharts: () => <div />,
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => (
    <button {...props}>{children}</button>
  ),
}));
vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children?: ReactNode }) => <section>{children}</section>,
  CardContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
}));
vi.mock("@/components/ui/input", () => ({
  Input: (props: Record<string, unknown>) => <input {...props} />,
}));
vi.mock("@/components/ui/label", () => ({
  Label: ({ children }: { children?: ReactNode }) => <label>{children}</label>,
}));
vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  TabsContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children?: ReactNode }) => <button>{children}</button>,
}));

import ProgressPage from "@/app/(private)/progress/page";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function renderPage() {
  if (!root) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  }
  await act(async () => {
    root!.render(<ProgressPage />);
  });
  await flush();
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.auth = {
    user: { id: ownerId },
    profile: null,
    session: { access_token: "progress-token-a" },
    refreshProfile: vi.fn(),
  };
  mocks.retry = null;
  mocks.progress.mockReset().mockResolvedValue([]);
  mocks.nutrition.mockReset().mockRejectedValue(new Error("nutrition unavailable"));
  mocks.canonical.mockReset().mockResolvedValue({
    contractVersion: 1,
    activities: [],
    sources: {
      performed: { source: "performed", state: "loaded" },
      scheduledFallback: { source: "scheduled_fallback", state: "loaded" },
    },
  });
});

afterEach(async () => {
  if (root) {
    await act(async () => root!.unmount());
  }
  root = null;
  container?.remove();
  container = null;
  vi.clearAllMocks();
});

describe("Progress canonical History auth context", () => {
  it("passes the AuthProvider token, ignores token-only refresh, and uses the latest token on genuine retry", async () => {
    await renderPage();

    expect(mocks.canonical).toHaveBeenCalledOnce();
    expect(mocks.canonical).toHaveBeenLastCalledWith(
      ownerId,
      180,
      { accessToken: "progress-token-a" },
    );

    mocks.auth = {
      ...mocks.auth,
      session: { access_token: "progress-token-b" },
    };
    await renderPage();
    expect(mocks.canonical).toHaveBeenCalledOnce();

    const retry = container?.querySelector<HTMLButtonElement>("[data-progress-retry]");
    expect(retry).not.toBeNull();
    await act(async () => retry!.click());
    await flush();

    expect(mocks.canonical).toHaveBeenCalledTimes(2);
    expect(mocks.canonical).toHaveBeenLastCalledWith(
      ownerId,
      180,
      { accessToken: "progress-token-b" },
    );
  });
});
