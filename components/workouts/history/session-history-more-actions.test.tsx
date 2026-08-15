// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ask: vi.fn(),
  toast: vi.fn(),
  push: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => ({ ask: mocks.ask, dialog: null }) }));
vi.mock("@/components/ui/toaster", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/components/ui/action-menu", () => ({
  ActionMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ActionMenuItem: ({ children, onSelect }: { children: ReactNode; onSelect: () => void }) => <button onClick={onSelect}>{children}</button>,
}));
vi.mock("@/lib/i18n/train", () => ({ useTrainTranslation: () => ({ tr: (key: string) => key }) }));
vi.mock("@/lib/reports/workout/download-client", () => ({ downloadPerformedWorkoutReport: vi.fn() }));

import { SessionHistoryMoreActions } from "@/components/workouts/history/session-history-more-actions";
import type { WorkoutHistorySessionDetailResponse } from "@/types/workout-history";

const detail = {
  activity: {
    canonicalSessionId: "11111111-1111-4111-8111-111111111111",
    effectiveAt: "2026-08-01T09:00:00.000Z",
    title: "Saved workout",
    capabilities: { downloadReport: false, correctSession: false, softDeleteSession: true },
  },
} as WorkoutHistorySessionDetailResponse;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.ask.mockReset();
  mocks.toast.mockReset();
  mocks.push.mockReset();
  mocks.fetch.mockReset().mockResolvedValue({ ok: false, json: async () => ({ error: "Delete failed safely." }) });
  vi.stubGlobal("fetch", mocks.fetch);
  vi.stubGlobal("crypto", { randomUUID: () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

describe("Session History destructive failure copy", () => {
  it("never reports DELETE failure with the success title", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root!.render(
      <SessionHistoryMoreActions detail={detail} accessToken="token" language="en" timezone="UTC" formattedDate="August 1" onCorrect={() => {}} freshAuthority />,
    ));
    await act(async () => container!.querySelector("button")!.click());
    const onConfirm = mocks.ask.mock.calls[0]?.[0]?.onConfirm as (() => void) | undefined;
    expect(onConfirm).toBeTypeOf("function");
    await act(async () => {
      onConfirm?.();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "historyWorkoutDeleteFailed", variant: "error" }));
    expect(mocks.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "historyWorkoutDeleted" }));
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
