export const MOBILE_NAV_ITEMS = [
  { id: "today", kind: "route", href: "/dashboard" },
  { id: "train", kind: "route", href: "/my-workout/plans" },
  { id: "quick-log", kind: "action" },
  { id: "eat", kind: "route", href: "/calories" },
  { id: "chatgpt", kind: "action" }
] as const;

export function isMobileRouteActive(pathname: string, id: "today" | "train" | "eat") {
  if (id === "today") return pathname === "/dashboard";
  if (id === "train") return pathname.startsWith("/my-workout") || pathname.startsWith("/workouts") || pathname.startsWith("/today-workout") || pathname.startsWith("/workout-history");
  return pathname.startsWith("/calories") || pathname.startsWith("/my-meal-plan");
}
