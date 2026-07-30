"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode
} from "react";

type MinimizeHandler = () => Promise<boolean>;

type ActiveWorkoutSessionNavigation = {
  registerMinimizeHandler: (handler: MinimizeHandler | null) => void;
  requestMinimize: () => Promise<boolean>;
};

const ActiveWorkoutSessionNavigationContext =
  createContext<ActiveWorkoutSessionNavigation | null>(null);

export function ActiveWorkoutSessionNavigationProvider({
  children
}: {
  children: ReactNode;
}) {
  const minimizeHandlerRef = useRef<MinimizeHandler | null>(null);
  const registerMinimizeHandler = useCallback((handler: MinimizeHandler | null) => {
    minimizeHandlerRef.current = handler;
  }, []);
  const requestMinimize = useCallback(
    () => minimizeHandlerRef.current?.() ?? Promise.resolve(true),
    []
  );
  const value = useMemo(
    () => ({ registerMinimizeHandler, requestMinimize }),
    [registerMinimizeHandler, requestMinimize]
  );

  return (
    <ActiveWorkoutSessionNavigationContext.Provider value={value}>
      {children}
    </ActiveWorkoutSessionNavigationContext.Provider>
  );
}

export function useRegisterActiveWorkoutMinimize(handler: MinimizeHandler) {
  const navigation = useContext(ActiveWorkoutSessionNavigationContext);

  useEffect(() => {
    if (!navigation) return;
    navigation.registerMinimizeHandler(handler);
    return () => navigation.registerMinimizeHandler(null);
  }, [handler, navigation]);
}

export function useActiveWorkoutSessionNavigation() {
  return useContext(ActiveWorkoutSessionNavigationContext);
}
