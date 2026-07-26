"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";
import type { ActiveSessionSnapshot, ActiveSessionStore } from "./store";

export function useActiveSessionSelector<T>(
  store: ActiveSessionStore,
  selector: (snapshot: ActiveSessionSnapshot) => T,
  isEqual: (left: T, right: T) => boolean = Object.is
) {
  const selectedRef = useRef<T>(selector(store.getSnapshot()));
  const getSelectedSnapshot = useCallback(() => {
    const selected = selector(store.getSnapshot());
    if (!isEqual(selectedRef.current, selected)) selectedRef.current = selected;
    return selectedRef.current;
  }, [isEqual, selector, store]);
  const subscribe = useCallback(
    (listener: () => void) => store.subscribeSelector(selector, listener, isEqual),
    [isEqual, selector, store]
  );
  return useSyncExternalStore(subscribe, getSelectedSnapshot, getSelectedSnapshot);
}
