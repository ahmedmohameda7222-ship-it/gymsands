import type { EntitlementState } from "@/lib/billing/contracts";

export const PLAIVRA_PLATFORM_CONTRACT_VERSION = "2026-07-11.v1" as const;

export type ApiEnvelope<T> = {
  contract_version: typeof PLAIVRA_PLATFORM_CONTRACT_VERSION;
  request_id: string;
  data: T;
  next_cursor?: string | null;
};

export type ApiProblem = {
  contract_version: typeof PLAIVRA_PLATFORM_CONTRACT_VERSION;
  request_id: string;
  error: { code: string; message: string; retryable: boolean; field?: string };
};

export type SyncMutation<T> = {
  idempotency_key: string;
  client_mutation_id: string;
  expected_updated_at: string | null;
  client_recorded_at: string;
  payload: T;
};

export type SyncMutationResult<T> = {
  record: T;
  stable_id: string;
  server_updated_at: string;
  outcome: "created" | "updated" | "duplicate";
};

export type VersionConflict = ApiProblem & {
  error: ApiProblem["error"] & { code: "version_conflict"; retryable: false };
};

export type EntitlementContract = {
  capability_key: string;
  state: EntitlementState;
  access_active: boolean;
  valid_through: string | null;
  recovery_url: string;
};

export const DEEP_LINK_ROUTES = {
  today: "/dashboard",
  train: "/my-workout/plans",
  eat: "/calories",
  progress: "/progress",
  settings: "/settings",
  connections: "/settings/connections",
  privacy: "/settings/data-privacy",
  subscription: "/settings/subscription"
} as const;

export type DeepLinkRouteKey = keyof typeof DEEP_LINK_ROUTES;

export function resolveDeepLink(url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "plaivra:" || parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash) return null;
  const key = parsed.hostname as DeepLinkRouteKey;
  return DEEP_LINK_ROUTES[key] ?? null;
}

export const ANALYTICS_EVENTS = [
  "screen_view",
  "onboarding_stage_completed",
  "connection_started",
  "connection_revoked",
  "tool_execution_completed",
  "sync_conflict_shown",
  "export_started",
  "deletion_request_started",
  "entitlement_state_shown"
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];
export type PrivacySafeAnalyticsEvent = {
  name: AnalyticsEventName;
  occurred_at: string;
  platform: "web" | "ios" | "android" | "chatgpt";
  app_version: string;
  route_key?: DeepLinkRouteKey;
  outcome?: "success" | "cancelled" | "error";
  error_code?: string;
};

export type NotificationContract = {
  notification_id: string;
  category: "workout_reminder" | "meal_reminder" | "privacy_request" | "connection_security";
  title: string;
  body: string;
  route_key: DeepLinkRouteKey;
  record_id?: string;
  contains_sensitive_metrics: false;
};
