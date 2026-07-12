export const UNSAVED_HISTORY_TOKEN_KEY = "plaivraUnsavedGuard";

type HistoryState = Record<string, unknown> | null;

export type UnsavedHistoryLike = {
  readonly state: unknown;
  replaceState(data: unknown, unused: string, url?: string | URL | null): void;
  back(): void;
  forward(): void;
};

export type UnsavedLocationLike = { href: string };
export type UnsavedPopStateResult = "ignored" | "intercepted" | "restored" | "allowed";

function stateRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? { ...(value as Record<string, unknown>) } : {};
}

function historyIndex(value: unknown) {
  if (typeof value !== "object" || value === null) return null;
  const index = (value as Record<string, unknown>).idx;
  return typeof index === "number" && Number.isFinite(index) ? index : null;
}

function defaultToken() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export class UnsavedHistorySentinel {
  private token: string | null = null;
  private originalState: HistoryState = null;
  private originalUrl = "";
  private originalIndex: number | null = null;
  private installed = false;
  private current = false;
  private restoring = false;
  private bypass = false;
  private navigationInProgress = false;

  constructor(
    private readonly history: UnsavedHistoryLike,
    private readonly location: UnsavedLocationLike,
    private readonly createToken: () => string = defaultToken
  ) {}

  activate() {
    if (this.installed) return this.token;
    this.token = this.createToken();
    this.originalState = typeof this.history.state === "object" && this.history.state !== null
      ? { ...(this.history.state as Record<string, unknown>) }
      : null;
    this.originalUrl = this.location.href;
    this.originalIndex = historyIndex(this.originalState);
    this.history.replaceState(
      { ...stateRecord(this.originalState), [UNSAVED_HISTORY_TOKEN_KEY]: this.token },
      "",
      this.originalUrl
    );
    this.installed = true;
    this.current = true;
    this.restoring = false;
    this.bypass = false;
    this.navigationInProgress = false;
    return this.token;
  }

  isInstalled() {
    return this.installed;
  }

  getToken() {
    return this.token;
  }

  isCurrentSentinel(state: unknown = this.history.state) {
    return Boolean(this.token && typeof state === "object" && state !== null
      && (state as Record<string, unknown>)[UNSAVED_HISTORY_TOKEN_KEY] === this.token);
  }

  handlePopState(state: unknown): UnsavedPopStateResult {
    if (this.bypass) {
      this.bypass = false;
      return "allowed";
    }
    if (!this.installed) return "ignored";
    if (this.isCurrentSentinel(state)) {
      this.current = true;
      this.restoring = false;
      return "restored";
    }
    if (this.restoring) return "ignored";

    this.current = false;
    this.restoring = true;
    const destinationIndex = historyIndex(state);
    if (destinationIndex !== null && this.originalIndex !== null && destinationIndex > this.originalIndex) {
      this.history.back();
    } else {
      this.history.forward();
    }
    return "intercepted";
  }

  deactivate() {
    if (!this.installed) return;
    if (this.current && this.isCurrentSentinel()) {
      this.history.replaceState(this.originalState, "", this.originalUrl);
    }
    this.clear();
  }

  prepareInAppNavigation() {
    if (this.current && this.isCurrentSentinel()) {
      this.history.replaceState(this.originalState, "", this.originalUrl);
    }
    this.navigationInProgress = true;
    this.bypass = true;
    this.installed = false;
    this.current = false;
    this.restoring = false;
  }

  continueHistoryExit() {
    if (this.current && this.isCurrentSentinel()) {
      this.history.replaceState(this.originalState, "", this.originalUrl);
    }
    this.navigationInProgress = true;
    this.bypass = true;
    this.installed = false;
    this.current = false;
    this.restoring = false;
    this.history.back();
  }

  dispose() {
    if (!this.navigationInProgress) this.deactivate();
  }

  private clear() {
    this.token = null;
    this.originalState = null;
    this.originalUrl = "";
    this.originalIndex = null;
    this.installed = false;
    this.current = false;
    this.restoring = false;
    this.bypass = false;
    this.navigationInProgress = false;
  }
}
