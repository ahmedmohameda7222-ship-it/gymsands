import { describe, expect, it, vi } from "vitest";
import { bindUnsavedBeforeUnload, resolveUnsavedInternalLink, type BeforeUnloadEventLike } from "@/lib/hooks/unsaved-navigation-events";

describe("unsaved navigation event behavior", () => {
  it("binds beforeunload only for the active lifecycle and removes the same listener", () => {
    let listener: ((event: BeforeUnloadEventLike) => void) | null = null;
    const target = {
      addEventListener: vi.fn((_type: "beforeunload", next: (event: BeforeUnloadEventLike) => void) => { listener = next; }),
      removeEventListener: vi.fn((_type: "beforeunload", next: (event: BeforeUnloadEventLike) => void) => {
        if (listener === next) listener = null;
      })
    };
    const cleanup = bindUnsavedBeforeUnload(target);
    const event = { preventDefault: vi.fn(), returnValue: undefined as unknown };
    expect(listener).not.toBeNull();
    (listener as unknown as (event: BeforeUnloadEventLike) => void)(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.returnValue).toBe("");
    cleanup();
    expect(listener).toBeNull();
    expect(target.removeEventListener).toHaveBeenCalledOnce();
  });

  const base = {
    defaultPrevented: false,
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    href: "https://plaivra.test/calories?date=2026-07-13#food",
    currentHref: "https://plaivra.test/settings/nutrition-targets?date=2026-07-12",
    target: "",
    download: false
  };

  it("intercepts a normal same-origin in-app link", () => {
    expect(resolveUnsavedInternalLink(base)).toBe("/calories?date=2026-07-13#food");
  });

  it.each([
    { defaultPrevented: true },
    { button: 1 },
    { metaKey: true },
    { ctrlKey: true },
    { shiftKey: true },
    { altKey: true },
    { target: "_blank" },
    { download: true }
  ])("does not intercept modified, handled, new-tab, or download clicks: %o", (patch) => {
    expect(resolveUnsavedInternalLink({ ...base, ...patch })).toBeNull();
  });

  it("does not intercept external or same-URL links", () => {
    expect(resolveUnsavedInternalLink({ ...base, href: "https://example.com/out" })).toBeNull();
    expect(resolveUnsavedInternalLink({ ...base, href: base.currentHref })).toBeNull();
  });
});
