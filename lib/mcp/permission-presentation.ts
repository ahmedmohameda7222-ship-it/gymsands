import type { AiPermissionSection } from "@/types";

export const FULL_ACCESS_WARNING =
  "Broad access: ChatGPT can read and manage every listed Plaivra area. Choose this only when you need cross-area access.";

export const AI_PERMISSION_SECTION_DETAILS: Record<
  AiPermissionSection,
  { label: string; readDescription: string; writeDescription: string; sensitive: boolean }
> = {
  workouts: {
    label: "Workouts",
    readDescription: "View workout plans, schedules, exercises, and workout history.",
    writeDescription: "Create or update plans and log workout activity.",
    sensitive: false
  },
  nutrition: {
    label: "Nutrition",
    readDescription: "View food logs, calories, macros, and saved foods.",
    writeDescription: "Create or update food and nutrition logs.",
    sensitive: true
  },
  meal_plans: {
    label: "Meal plans",
    readDescription: "View planned meals and meal-plan items.",
    writeDescription: "Create or update meal plans and planned meals.",
    sensitive: true
  },
  hydration: {
    label: "Hydration",
    readDescription: "View water goals and hydration history.",
    writeDescription: "Add or update water logs and hydration goals.",
    sensitive: true
  },
  wellness: {
    label: "Wellness",
    readDescription: "View habits, sleep, recovery, supplements, and daily tasks.",
    writeDescription: "Create or update wellness logs, habits, supplements, and tasks.",
    sensitive: true
  },
  progress: {
    label: "Progress",
    readDescription: "View progress records, measurements, and personal records.",
    writeDescription: "Add or update progress, measurement, and record entries.",
    sensitive: true
  },
  profile: {
    label: "Profile",
    readDescription: "View the fitness profile and preferences used to personalize plans.",
    writeDescription: "Update supported profile and fitness-preference fields.",
    sensitive: true
  },
  settings: {
    label: "Settings",
    readDescription: "View supported Plaivra app settings.",
    writeDescription: "Update supported app settings; account security settings remain excluded.",
    sensitive: false
  }
};

export function permissionGroupsForScopes(scopeValue: string | null | undefined) {
  const scopes = new Set(String(scopeValue ?? "").split(/\s+/).filter(Boolean));
  const fullAccess = scopes.has("plaivra.full_access");
  const groups = (Object.entries(AI_PERMISSION_SECTION_DETAILS) as Array<
    [AiPermissionSection, (typeof AI_PERMISSION_SECTION_DETAILS)[AiPermissionSection]]
  >).flatMap(([section, details]) => {
    const read = fullAccess || scopes.has(`plaivra.${section}.read`) || scopes.has(`plaivra.${section}.write`);
    const write = fullAccess || scopes.has(`plaivra.${section}.write`);
    return read ? [{ section, ...details, canRead: read, canWrite: write }] : [];
  });
  return { fullAccess, groups };
}
