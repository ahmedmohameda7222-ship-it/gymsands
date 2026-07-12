import { describe, expect, it } from "vitest";
import { UNSAVED_HISTORY_TOKEN_KEY, UnsavedHistorySentinel, type UnsavedHistoryLike } from "@/lib/hooks/unsaved-history-sentinel";

type Entry = { state: Record<string, unknown>; url: string };

class FakeHistory implements UnsavedHistoryLike {
  entries: Entry[];
  index: number;
  backCalls = 0;
  forwardCalls = 0;
  replaceCalls = 0;

  constructor(entries: Entry[], index = entries.length - 1) {
    this.entries = structuredClone(entries);
    this.index = index;
  }

  get state() { return this.entries[this.index]?.state ?? null; }
  get url() { return this.entries[this.index]?.url ?? ""; }
  replaceState(data: unknown, _unused: string, url?: string | URL | null) {
    this.replaceCalls += 1;
    this.entries[this.index] = {
      state: (typeof data === "object" && data !== null ? structuredClone(data) : {}) as Record<string, unknown>,
      url: url ? String(url) : this.url
    };
  }
  back() { this.backCalls += 1; if (this.index > 0) this.index -= 1; }
  forward() { this.forwardCalls += 1; if (this.index < this.entries.length - 1) this.index += 1; }
}

function setup(includeForward = false) {
  const entries: Entry[] = [
    { state: { idx: 0, page: "previous" }, url: "https://plaivra.test/dashboard" },
    { state: { idx: 1, page: "targets" }, url: "https://plaivra.test/settings/nutrition-targets?date=2026-07-12" }
  ];
  if (includeForward) entries.push({ state: { idx: 2, page: "next" }, url: "https://plaivra.test/profile" });
  const history = new FakeHistory(entries, 1);
  let tokenNumber = 0;
  const sentinel = new UnsavedHistorySentinel(history, { get href() { return history.url; } }, () => `token-${++tokenNumber}`);
  return { history, sentinel };
}

describe("unsaved history sentinel", () => {
  it("does not change clean-page history", () => {
    const { history } = setup();
    history.back();
    expect(history.index).toBe(0);
    expect(history.entries).toHaveLength(2);
  });

  it("installs exactly one token without adding a duplicate entry", () => {
    const { history, sentinel } = setup();
    sentinel.activate();
    sentinel.activate();
    expect(history.entries).toHaveLength(2);
    expect(history.state[UNSAVED_HISTORY_TOKEN_KEY]).toBe("token-1");
    expect(history.replaceCalls).toBe(1);
  });

  it("intercepts Back while dirty, restores the current entry, and keeps the guard active", () => {
    const { history, sentinel } = setup();
    sentinel.activate();
    history.back();
    expect(sentinel.handlePopState(history.state)).toBe("intercepted");
    expect(history.forwardCalls).toBe(1);
    expect(history.index).toBe(1);
    expect(sentinel.handlePopState(history.state)).toBe("restored");
    expect(sentinel.isInstalled()).toBe(true);
  });

  it("Stay keeps the restored sentinel and dirty session active", () => {
    const { history, sentinel } = setup();
    sentinel.activate();
    history.back();
    sentinel.handlePopState(history.state);
    sentinel.handlePopState(history.state);
    expect(sentinel.isCurrentSentinel()).toBe(true);
    expect(history.entries).toHaveLength(2);
  });

  it("direct Apply cleanup restores the original state so one Back leaves", () => {
    const { history, sentinel } = setup();
    sentinel.activate();
    sentinel.deactivate();
    expect(history.state).toEqual({ idx: 1, page: "targets" });
    expect(history.entries).toHaveLength(2);
    history.back();
    expect(history.index).toBe(0);
  });

  it("direct Discard cleanup leaves no token or duplicate same-URL entry", () => {
    const { history, sentinel } = setup();
    sentinel.activate();
    sentinel.deactivate();
    expect(history.entries.filter((entry) => entry.url.includes("nutrition-targets"))).toHaveLength(1);
    expect(history.entries.some((entry) => UNSAVED_HISTORY_TOKEN_KEY in entry.state)).toBe(false);
  });

  it("Apply-and-continue exits through one Back after successful persistence", () => {
    const { history, sentinel } = setup();
    sentinel.activate();
    history.back();
    sentinel.handlePopState(history.state);
    sentinel.handlePopState(history.state);
    sentinel.continueHistoryExit();
    expect(history.backCalls).toBe(2);
    expect(history.index).toBe(0);
    expect(history.entries).toHaveLength(2);
  });

  it("a failed Apply leaves the restored guard untouched", () => {
    const { history, sentinel } = setup();
    sentinel.activate();
    history.back();
    sentinel.handlePopState(history.state);
    sentinel.handlePopState(history.state);
    expect(sentinel.isInstalled()).toBe(true);
    expect(history.index).toBe(1);
  });

  it("Discard-and-continue preserves the intended previous destination", () => {
    const { history, sentinel } = setup();
    sentinel.activate();
    history.back();
    sentinel.handlePopState(history.state);
    sentinel.handlePopState(history.state);
    sentinel.continueHistoryExit();
    expect(history.url).toBe("https://plaivra.test/dashboard");
  });

  it("clean to dirty again installs one new token and does not add entries", () => {
    const { history, sentinel } = setup();
    sentinel.activate();
    expect(sentinel.getToken()).toBe("token-1");
    sentinel.deactivate();
    sentinel.activate();
    expect(sentinel.getToken()).toBe("token-2");
    expect(history.entries).toHaveLength(2);
  });

  it("Forward movement restores the sentinel without duplicating it", () => {
    const { history, sentinel } = setup(true);
    sentinel.activate();
    history.forward();
    expect(sentinel.handlePopState(history.state)).toBe("intercepted");
    expect(history.backCalls).toBe(1);
    expect(history.index).toBe(1);
    expect(sentinel.handlePopState(history.state)).toBe("restored");
    expect(history.entries).toHaveLength(3);
  });

  it("prepares in-app navigation by restoring the original entry without history traversal", () => {
    const { history, sentinel } = setup();
    sentinel.activate();
    sentinel.prepareInAppNavigation();
    expect(history.state).toEqual({ idx: 1, page: "targets" });
    expect(history.backCalls).toBe(0);
    expect(history.forwardCalls).toBe(0);
  });

  it("dispose removes an active token unless navigation is already continuing", () => {
    const first = setup();
    first.sentinel.activate();
    first.sentinel.dispose();
    expect(first.history.state).toEqual({ idx: 1, page: "targets" });

    const second = setup();
    second.sentinel.activate();
    second.sentinel.prepareInAppNavigation();
    second.sentinel.dispose();
    expect(second.history.state).toEqual({ idx: 1, page: "targets" });
  });
});
