"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronDown } from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import {
  ActiveWorkoutSessionNavigationProvider,
  useActiveWorkoutSessionNavigation
} from "@/components/workouts/active-workout/active-workout-session-navigation";
import { readPreviousActiveWorkoutRoute } from "@/lib/active-workout";
import { useActiveWorkoutTranslation } from "@/lib/i18n/active-workout";

type WorkoutSessionFallback = "/my-workout/plans" | "/workouts";

export function WorkoutSessionScreen({
  children,
  fallbackHref
}: {
  children: React.ReactNode;
  fallbackHref: WorkoutSessionFallback;
}) {
  return (
    <ActiveWorkoutSessionNavigationProvider>
      <WorkoutSessionScreenSurface fallbackHref={fallbackHref}>
        {children}
      </WorkoutSessionScreenSurface>
    </ActiveWorkoutSessionNavigationProvider>
  );
}

function WorkoutSessionScreenSurface({
  children,
  fallbackHref
}: {
  children: React.ReactNode;
  fallbackHref: WorkoutSessionFallback;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const reduceMotion = useReducedMotion();
  const { direction: dir, t } = useActiveWorkoutTranslation();
  const navigation = useActiveWorkoutSessionNavigation();
  const [isClosing, setIsClosing] = useState(false);
  const [isMinimizing, setIsMinimizing] = useState(false);
  const destinationRef = useRef<WorkoutSessionFallback | string>(fallbackHref);
  const minimizeStartedRef = useRef(false);

  const handleMinimize = useCallback(async () => {
    if (minimizeStartedRef.current || isClosing || isMinimizing) return;
    minimizeStartedRef.current = true;
    setIsMinimizing(true);
    let safeToNavigate = false;
    try {
      safeToNavigate = await (
        navigation?.requestMinimize() ?? Promise.resolve(true)
      );
      if (!safeToNavigate) return;
      destinationRef.current = user?.id
        ? readPreviousActiveWorkoutRoute(user.id) ?? fallbackHref
        : fallbackHref;
      setIsClosing(true);
    } finally {
      if (!safeToNavigate) {
        minimizeStartedRef.current = false;
        setIsMinimizing(false);
      }
    }
  }, [fallbackHref, isClosing, isMinimizing, navigation, user?.id]);

  useEffect(() => {
    const guardKey = "plaivraAw7SessionGuard";
    if (!window.history.state?.[guardKey]) {
      window.history.pushState(
        { ...(window.history.state ?? {}), [guardKey]: true },
        "",
        window.location.href
      );
    }
    const handlePopState = () => {
      if (minimizeStartedRef.current) return;
      window.history.pushState(
        { ...(window.history.state ?? {}), [guardKey]: true },
        "",
        window.location.href
      );
      void handleMinimize();
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [handleMinimize]);

  return (
    <motion.div
      className="absolute inset-0 z-50 flex flex-col bg-background"
      style={{ willChange: "transform" }}
      initial={reduceMotion ? false : { y: "100%" }}
      animate={isClosing ? { y: "100%" } : { y: 0 }}
      transition={{
        duration: reduceMotion ? 0.001 : 0.38,
        ease: [0.22, 1, 0.36, 1]
      }}
      onAnimationComplete={() => {
        if (isClosing) router.push(destinationRef.current);
      }}
      dir={dir}
    >
      <Button
        data-workout-session-close
        type="button"
        variant="outline"
        size="icon"
        onClick={() => { void handleMinimize(); }}
        disabled={isMinimizing}
        className="absolute start-3 top-3 z-[40] h-12 w-12 rounded-full bg-card/95 shadow-lg backdrop-blur sm:start-5 sm:top-5 lg:start-1"
        aria-label={t("accessibility.minimizeWorkout")}
        title={t("accessibility.minimizeWorkout")}
      >
        <ChevronDown className="h-5 w-5" aria-hidden="true" />
      </Button>
      <div
        data-workout-session-scroll
        className="flex-1 overflow-y-auto overscroll-contain px-4 pb-2 pt-0 [scroll-padding-bottom:calc(7rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-8"
      >
        {children}
      </div>
    </motion.div>
  );
}
