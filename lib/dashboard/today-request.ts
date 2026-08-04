export type DashboardSourceState = "idle" | "loading" | "loaded" | "failed";

export function dashboardRequestKey(
  userId: string | null | undefined,
  date: string,
  timezone: string,
) {
  return `${userId ?? "signed-out"}:${date}:${timezone}`;
}

export function isDashboardRequestCurrent(input: {
  activeGeneration: number;
  requestGeneration: number;
  activeKey: string;
  requestKey: string;
}) {
  return (
    input.activeGeneration === input.requestGeneration &&
    input.activeKey === input.requestKey
  );
}

export function dashboardValueForRequest<T>(input: {
  resolvedKey: string | null;
  currentKey: string;
  value: T | null;
}) {
  return input.resolvedKey === input.currentKey ? input.value : null;
}
