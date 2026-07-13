export const MOBILE_NAV_ITEMS = [
  { id: "today", kind: "route", href: "/dashboard" },
  { id: "train", kind: "route", href: "/my-workout/plans" },
  { id: "quick-log", kind: "action" },
  { id: "eat", kind: "route", href: "/calories" },
  { id: "chatgpt", kind: "action" }
] as const;

export type TrainNavigationTarget = "train" | "exercise-library" | "workout-history";

export function getTrainNavigationTarget(pathname: string): TrainNavigationTarget | null {
  if (pathname === "/workout-history" || pathname.startsWith("/workout-history/")) return "workout-history";
  if (pathname === "/workouts" || (pathname.startsWith("/workouts/") && !pathname.startsWith("/workouts/session/"))) {
    return "exercise-library";
  }
  if (pathname === "/my-workout" || pathname.startsWith("/my-workout/") || pathname.startsWith("/workouts/session/") || pathname === "/today-workout") {
    return "train";
  }
  return null;
}

export function isMobileRouteActive(pathname: string, id: "today" | "train" | "eat") {
  if (id === "today") return pathname === "/dashboard";
  if (id === "train") return getTrainNavigationTarget(pathname) === "train";
  return pathname.startsWith("/calories") || pathname.startsWith("/my-meal-plan");
}
