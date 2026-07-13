import { getReleaseVersion } from "@/lib/release/version";

const REDACTED = "[REDACTED]";
const MAX_MESSAGE = 500;
const MAX_STACK = 2400;
const MAX_COMPONENT_STACK = 1600;
const MAX_ROUTE = 180;
const ALLOWED_FIELDS = new Set([
  "eventId",
  "errorType",
  "message",
  "stack",
  "componentStack",
  "digest",
  "route",
  "boundarySource",
  "commitSha",
  "buildTimestamp",
  "browser",
  "hasTargets",
  "hasFoodLogs",
  "targetLoadState",
  "foodLogLoadState"
]);
const SAFE_CODE = /^[a-z0-9_.-]{1,80}$/i;
const SAFE_BROWSER = /^[a-z][a-z0-9 ._-]{0,30}\/\d{1,3}$/i;
const EXACT_SHA = /^[a-f0-9]{40}$/i;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const RECORD_UUID = /\b[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\b/gi;
const COOKIE = /\b(?:cookie|set-cookie)\s*:\s*[^\r\n]+/gi;
const AUTHORIZATION = /\bauthorization\s*:\s*[^\r\n]+/gi;
const URL_QUERY = /(https?:\/\/[^\s?#]+)(?:\?[^\s#]*)?(?:#[^\s]*)?/gi;
const QUERY_FRAGMENT = /\?(?:[^\s#]|%[0-9a-f]{2})+/gi;
const LOAD_STATE = new Set(["loading", "loaded", "failed", "unknown"]);

export type ClientBoundarySource = "route" | "global" | "component";
export type ClientErrorDiagnosticState = {
  hasTargets?: boolean;
  hasFoodLogs?: boolean;
  targetLoadState?: "loading" | "loaded" | "failed" | "unknown";
  foodLogLoadState?: "loading" | "loaded" | "failed" | "unknown";
};

export type ClientErrorEnvelope = ClientErrorDiagnosticState & {
  eventId: string;
  errorType: string;
  message: string;
  stack?: string;
  componentStack?: string;
  digest?: string;
  route: string;
  boundarySource: ClientBoundarySource;
  commitSha: string;
  buildTimestamp: string;
  browser: string;
};

export type ClientErrorValidation =
  | { ok: true; value: ClientErrorEnvelope }
  | { ok: false; error: string };

export function sanitizeClientErrorText(value: unknown, maximum = MAX_MESSAGE) {
  if (typeof value !== "string") return "";
  return value
    .replace(BEARER, REDACTED)
    .replace(JWT, REDACTED)
    .replace(EMAIL, REDACTED)
    .replace(COOKIE, `cookie: ${REDACTED}`)
    .replace(AUTHORIZATION, `authorization: ${REDACTED}`)
    .replace(URL_QUERY, "$1")
    .replace(QUERY_FRAGMENT, "?[REDACTED]")
    .replace(RECORD_UUID, REDACTED)
    .slice(0, maximum);
}

export function sanitizeClientRoute(value: unknown) {
  if (typeof value !== "string") return "/unknown";
  try {
    const parsed = new URL(value, "https://plaivra.invalid");
    const route = parsed.pathname.replace(/\/+/g, "/").slice(0, MAX_ROUTE);
    return /^\/[a-z0-9/_-]*$/i.test(route) ? route : "/unknown";
  } catch {
    return "/unknown";
  }
}

export function coarseBrowser(userAgent: string | undefined) {
  const value = userAgent ?? "";
  const candidates = [
    [/Edg\/(\d+)/, "Edge"],
    [/Chrome\/(\d+)/, "Chrome"],
    [/Firefox\/(\d+)/, "Firefox"],
    [/Version\/(\d+).+Safari\//, "Safari"]
  ] as const;
  for (const [pattern, name] of candidates) {
    const match = value.match(pattern);
    if (match) return `${name}/${match[1]}`;
  }
  return "Unknown/0";
}

export function validateClientErrorPayload(input: unknown): ClientErrorValidation {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "invalid_payload" };
  const record = input as Record<string, unknown>;
  const unexpected = Object.keys(record).filter((key) => !ALLOWED_FIELDS.has(key));
  if (unexpected.length) return { ok: false, error: "unsupported_fields" };

  const eventId = typeof record.eventId === "string" && UUID.test(record.eventId) ? record.eventId.toLowerCase() : "";
  const errorType = typeof record.errorType === "string" && SAFE_CODE.test(record.errorType) ? record.errorType : "";
  const message = sanitizeClientErrorText(record.message, MAX_MESSAGE);
  const route = sanitizeClientRoute(record.route);
  const boundarySource = record.boundarySource === "route" || record.boundarySource === "global" || record.boundarySource === "component"
    ? record.boundarySource
    : null;
  const commitSha = typeof record.commitSha === "string" && EXACT_SHA.test(record.commitSha)
    ? record.commitSha.toLowerCase()
    : "";
  const buildTimestamp = typeof record.buildTimestamp === "string" && !Number.isNaN(Date.parse(record.buildTimestamp))
    ? new Date(record.buildTimestamp).toISOString()
    : "";
  const browser = typeof record.browser === "string" && SAFE_BROWSER.test(record.browser) ? record.browser : "Unknown/0";

  if (!eventId || !errorType || !message || !boundarySource || !commitSha || !buildTimestamp) {
    return { ok: false, error: "invalid_fields" };
  }

  const digest = typeof record.digest === "string" && SAFE_CODE.test(record.digest) ? record.digest : undefined;
  const stack = sanitizeClientErrorText(record.stack, MAX_STACK) || undefined;
  const componentStack = sanitizeClientErrorText(record.componentStack, MAX_COMPONENT_STACK) || undefined;
  const targetLoadState = typeof record.targetLoadState === "string" && LOAD_STATE.has(record.targetLoadState)
    ? record.targetLoadState as ClientErrorDiagnosticState["targetLoadState"]
    : undefined;
  const foodLogLoadState = typeof record.foodLogLoadState === "string" && LOAD_STATE.has(record.foodLogLoadState)
    ? record.foodLogLoadState as ClientErrorDiagnosticState["foodLogLoadState"]
    : undefined;

  return {
    ok: true,
    value: {
      eventId,
      errorType,
      message,
      stack,
      componentStack,
      digest,
      route,
      boundarySource,
      commitSha,
      buildTimestamp,
      browser,
      hasTargets: typeof record.hasTargets === "boolean" ? record.hasTargets : undefined,
      hasFoodLogs: typeof record.hasFoodLogs === "boolean" ? record.hasFoodLogs : undefined,
      targetLoadState,
      foodLogLoadState
    }
  };
}

export function buildClientErrorEnvelope({
  error,
  boundarySource,
  digest,
  componentStack,
  diagnosticState
}: {
  error: Error;
  boundarySource: ClientBoundarySource;
  digest?: string;
  componentStack?: string;
  diagnosticState?: ClientErrorDiagnosticState;
}): ClientErrorEnvelope | null {
  const release = getReleaseVersion();
  const eventId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : "00000000-0000-4000-8000-000000000000";
  const validation = validateClientErrorPayload({
    eventId,
    errorType: sanitizeClientErrorText(error.name || "Error", 80).replace(/[^a-z0-9_.-]/gi, "_") || "Error",
    message: error.message || "Client rendering failed.",
    stack: error.stack,
    componentStack,
    digest,
    route: typeof window !== "undefined" ? window.location.pathname : "/unknown",
    boundarySource,
    commitSha: release.commitSha,
    buildTimestamp: release.buildTimestamp,
    browser: coarseBrowser(typeof navigator !== "undefined" ? navigator.userAgent : undefined),
    ...diagnosticState
  });
  return validation.ok ? validation.value : null;
}

export function reportClientError(input: Parameters<typeof buildClientErrorEnvelope>[0]) {
  if (typeof window === "undefined") return;
  const envelope = buildClientErrorEnvelope(input);
  if (!envelope) return;
  void fetch("/api/observability/client-error", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(envelope),
    keepalive: true
  }).catch(() => undefined);
}
