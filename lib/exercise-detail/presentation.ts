"use client";

import { useEffect, useState } from "react";

export type DetailPlatformPresentation = "web" | "ios" | "android";
const DETAIL_CHILD_ROUTES = new Set(["anatomy", "technique", "performance", "alternatives", "details"]);

export function isCanonicalExerciseDetailRoute(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "workouts" || parts.length < 2 || parts.length > 3) return false;
  if (parts[1] === "session") return false;
  return parts.length === 2 || DETAIL_CHILD_ROUTES.has(parts[2]);
}

/**
 * Presentation-only platform hint. It is intentionally centralized, SSR-safe and
 * never changes data, routing or authorization. The initial Web value has the same
 * geometry as the mobile variants, so hydration cannot move content.
 */
export function useDetailPlatformPresentation(): DetailPlatformPresentation {
  const [presentation, setPresentation] = useState<DetailPlatformPresentation>("web");
  useEffect(() => {
    const agent = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(agent)) setPresentation("ios");
    else if (/android/.test(agent)) setPresentation("android");
  }, []);
  return presentation;
}
