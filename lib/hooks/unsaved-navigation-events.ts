export type BeforeUnloadEventLike = {
  preventDefault(): void;
  returnValue: unknown;
};

export type BeforeUnloadTargetLike = {
  addEventListener(type: "beforeunload", listener: (event: BeforeUnloadEventLike) => void): void;
  removeEventListener(type: "beforeunload", listener: (event: BeforeUnloadEventLike) => void): void;
};

export function bindUnsavedBeforeUnload(target: BeforeUnloadTargetLike) {
  const listener = (event: BeforeUnloadEventLike) => {
    event.preventDefault();
    event.returnValue = "";
  };
  target.addEventListener("beforeunload", listener);
  return () => target.removeEventListener("beforeunload", listener);
}

export type UnsavedLinkIntent = {
  defaultPrevented: boolean;
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  href: string;
  currentHref: string;
  target?: string | null;
  download?: boolean;
};

export function resolveUnsavedInternalLink(intent: UnsavedLinkIntent) {
  if (
    intent.defaultPrevented
    || intent.button !== 0
    || intent.metaKey
    || intent.ctrlKey
    || intent.shiftKey
    || intent.altKey
    || intent.target === "_blank"
    || intent.download
  ) return null;

  const current = new URL(intent.currentHref);
  const destination = new URL(intent.href, current);
  if (destination.origin !== current.origin || destination.href === current.href) return null;
  return `${destination.pathname}${destination.search}${destination.hash}`;
}
