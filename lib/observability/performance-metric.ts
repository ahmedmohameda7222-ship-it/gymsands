import { getReleaseVersion } from "@/lib/release/version";
import { coarseBrowser, sanitizeClientRoute } from "@/lib/observability/client-error";

const METRIC_NAMES = ["CLS", "FCP", "INP", "LCP", "TTFB", "APP_BOOT"] as const;
const METRIC_NAME_SET = new Set<string>(METRIC_NAMES);
const RATINGS = new Set(["good", "needs-improvement", "poor", "unrated"]);
const NAVIGATION_TYPES = new Set([
  "navigate",
  "reload",
  "back_forward",
  "back_forward_cache",
  "prerender",
  "restore",
  "unknown",
]);
const CONNECTION_TYPES = new Set(["slow-2g", "2g", "3g", "4g", "unknown"]);
const VISIBILITY_STATES = new Set(["visible", "hidden", "prerender", "unknown"]);
const ALLOWED_FIELDS = new Set([
  "eventId",
  "metricId",
  "metric",
  "value",
  "delta",
  "rating",
  "route",
  "navigationType",
  "visibilityState",
  "connectionType",
  "commitSha",
  "buildTimestamp",
  "browser",
]);
const EXACT_SHA = /^[a-f0-9]{40}$/i;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const SAFE_ID = /^[a-z0-9._:-]{1,128}$/i;
const SAFE_BROWSER = /^[a-z][a-z0-9 ._-]{0,30}\/\d{1,3}$/i;
const MAX_METRIC_VALUE = 86_400_000;

export type PerformanceMetricName = (typeof METRIC_NAMES)[number];
export type PerformanceMetricRating = "good" | "needs-improvement" | "poor" | "unrated";
export type PerformanceMetricEnvelope = {
  eventId: string;
  metricId: string;
  metric: PerformanceMetricName;
  value: number;
  delta: number;
  rating: PerformanceMetricRating;
  route: string;
  navigationType: string;
  visibilityState: string;
  connectionType: string;
  commitSha: string;
  buildTimestamp: string;
  browser: string;
};

export type PerformanceMetricValidation =
  | { ok: true; value: PerformanceMetricEnvelope }
  | { ok: false; error: string };

type WebVitalLike = {
  id: string;
  name: string;
  value: number;
  delta: number;
  rating?: string;
  navigationType?: string;
};

type NavigatorWithConnection = Navigator & {
  connection?: { effectiveType?: string };
};

function finiteNumber(value: unknown, { allowNegative = false } = {}) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (!allowNegative && value < 0) return null;
  if (Math.abs(value) > MAX_METRIC_VALUE) return null;
  return value;
}

function normalizedEnum(value: unknown, allowed: Set<string>, fallback: string) {
  return typeof value === "string" && allowed.has(value) ? value : fallback;
}

function randomEventId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : "00000000-0000-4000-8000-000000000000";
}

function currentNavigationType() {
  if (typeof performance === "undefined") return "unknown";
  const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  return normalizedEnum(navigation?.type, NAVIGATION_TYPES, "unknown");
}

function currentConnectionType() {
  if (typeof navigator === "undefined") return "unknown";
  const connection = (navigator as NavigatorWithConnection).connection?.effectiveType;
  return normalizedEnum(connection, CONNECTION_TYPES, "unknown");
}

function currentVisibilityState() {
  if (typeof document === "undefined") return "unknown";
  return normalizedEnum(document.visibilityState, VISIBILITY_STATES, "unknown");
}

export function validatePerformanceMetricPayload(input: unknown): PerformanceMetricValidation {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "invalid_payload" };
  }
  const record = input as Record<string, unknown>;
  if (Object.keys(record).some((key) => !ALLOWED_FIELDS.has(key))) {
    return { ok: false, error: "unsupported_fields" };
  }

  const eventId = typeof record.eventId === "string" && UUID.test(record.eventId)
    ? record.eventId.toLowerCase()
    : "";
  const metricId = typeof record.metricId === "string" && SAFE_ID.test(record.metricId)
    ? record.metricId
    : "";
  const metric = typeof record.metric === "string" && METRIC_NAME_SET.has(record.metric)
    ? record.metric as PerformanceMetricName
    : null;
  const value = finiteNumber(record.value);
  const delta = finiteNumber(record.delta, { allowNegative: true });
  const rating = normalizedEnum(record.rating, RATINGS, "") as PerformanceMetricRating | "";
  const route = sanitizeClientRoute(record.route);
  const navigationType = normalizedEnum(record.navigationType, NAVIGATION_TYPES, "unknown");
  const visibilityState = normalizedEnum(record.visibilityState, VISIBILITY_STATES, "unknown");
  const connectionType = normalizedEnum(record.connectionType, CONNECTION_TYPES, "unknown");
  const commitSha = typeof record.commitSha === "string" && EXACT_SHA.test(record.commitSha)
    ? record.commitSha.toLowerCase()
    : "";
  const buildTimestamp = typeof record.buildTimestamp === "string" && !Number.isNaN(Date.parse(record.buildTimestamp))
    ? new Date(record.buildTimestamp).toISOString()
    : "";
  const browser = typeof record.browser === "string" && SAFE_BROWSER.test(record.browser)
    ? record.browser
    : "Unknown/0";

  if (!eventId || !metricId || !metric || value === null || delta === null || !rating || !commitSha || !buildTimestamp) {
    return { ok: false, error: "invalid_fields" };
  }

  return {
    ok: true,
    value: {
      eventId,
      metricId,
      metric,
      value,
      delta,
      rating,
      route,
      navigationType,
      visibilityState,
      connectionType,
      commitSha,
      buildTimestamp,
      browser,
    },
  };
}

export function buildPerformanceMetricEnvelope(metric: WebVitalLike): PerformanceMetricEnvelope | null {
  const release = getReleaseVersion();
  const validation = validatePerformanceMetricPayload({
    eventId: randomEventId(),
    metricId: metric.id,
    metric: metric.name,
    value: metric.value,
    delta: metric.delta,
    rating: metric.rating ?? "unrated",
    route: typeof window !== "undefined" ? window.location.pathname : "/unknown",
    navigationType: metric.navigationType ?? currentNavigationType(),
    visibilityState: currentVisibilityState(),
    connectionType: currentConnectionType(),
    commitSha: release.commitSha,
    buildTimestamp: release.buildTimestamp,
    browser: coarseBrowser(typeof navigator !== "undefined" ? navigator.userAgent : undefined),
  });
  return validation.ok ? validation.value : null;
}

function sendPerformanceMetric(envelope: PerformanceMetricEnvelope) {
  if (typeof window === "undefined") return;
  const endpoint = "/api/observability/performance-metric";
  const body = JSON.stringify(envelope);
  try {
    if (typeof navigator.sendBeacon === "function") {
      const accepted = navigator.sendBeacon(endpoint, new Blob([body], { type: "application/json" }));
      if (accepted) return;
    }
  } catch {
    // Fall through to fetch. Telemetry must never block the product flow.
  }
  void fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
}

export function reportWebVitalMetric(metric: WebVitalLike) {
  if (process.env.NODE_ENV !== "production") return;
  const envelope = buildPerformanceMetricEnvelope(metric);
  if (envelope) sendPerformanceMetric(envelope);
}

export function reportAuthenticatedAppBoot() {
  if (process.env.NODE_ENV !== "production" || typeof performance === "undefined") return;
  const value = Math.max(0, performance.now());
  const envelope = buildPerformanceMetricEnvelope({
    id: `app-boot-${Math.round(value)}`,
    name: "APP_BOOT",
    value,
    delta: value,
    rating: "unrated",
    navigationType: currentNavigationType(),
  });
  if (envelope) sendPerformanceMetric(envelope);
}
