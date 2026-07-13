export const DASHBOARD_SOURCE_NAMES = ["workout", "meals", "nutrition", "hydration", "shopping", "wellness"] as const;

export type DashboardSourceName = (typeof DASHBOARD_SOURCE_NAMES)[number];
export type DashboardSourceState = "idle" | "loading" | "loaded" | "failed";
export type DashboardSourceStates = Record<DashboardSourceName, DashboardSourceState>;

export function dashboardRequestKey(userId: string | null | undefined, date: string) {
  return `${userId ?? "signed-out"}:${date}`;
}

export function dashboardSourceStates(state: DashboardSourceState): DashboardSourceStates {
  return Object.fromEntries(DASHBOARD_SOURCE_NAMES.map((name) => [name, state])) as DashboardSourceStates;
}

export function isDashboardRequestCurrent(input: {
  activeVersion: number;
  requestVersion: number;
  activeKey: string;
  requestKey: string;
}) {
  return input.activeVersion === input.requestVersion && input.activeKey === input.requestKey;
}

export function dashboardValueForRequest<T>(input: {
  activeKey: string;
  currentKey: string;
  value: T;
  fallback: T;
}) {
  return input.activeKey === input.currentKey ? input.value : input.fallback;
}
