const REDACTED = "[REDACTED]";
const SENSITIVE_KEY = /(?:authorization|cookie|token|secret|password|email|address|name|prompt|notes?|diagnos|injur|allerg|weight|calorie|nutrition|body|photo|payload|user_id|record_id)/i;
const CORRELATION_ID_KEY = /^(?:request_id|client_event_id|catalog_request_group_id)$/;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const UUID = /\b[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\b/gi;
const QUERY = /(https?:\/\/[^\s?#]+)(?:\?[^\s#]*)?(?:#[^\s]*)?/gi;

export type LogLevel = "info" | "warn" | "error";
export type OperationalLog = {
  event: string;
  level: LogLevel;
  request_id?: string;
  catalog_request_group_id?: string;
  route?: string;
  endpoint?: string;
  operation?: string;
  outcome?: "success" | "success_with_fallback" | "failed_closed" | "invalid_request" | "rejected" | "error" | "ignored";
  provider_requested?: "legacy" | "external" | "external_with_legacy_fallback";
  provider_used?: "legacy" | "external" | "none";
  fallback_occurred?: boolean;
  fallback_reason?: "none" | "external_timeout" | "external_network_error" | "external_rate_limited" | "external_upstream_5xx" | "external_not_found";
  fallback_stage?: "none" | "provider_request" | "response_status" | "response_parse" | "response_validation";
  http_status?: number;
  provider_duration_ms?: number;
  total_duration_ms?: number;
  result_count?: number;
  page?: number;
  limit?: number;
  has_search?: boolean;
  filter_count?: number;
  response_bytes?: number;
  cache_status?: "hit" | "miss" | "bypass" | "not_applicable";
  error_code?: string;
  error_type?: string;
  error_message?: string;
  stack?: string;
  component_stack?: string;
  boundary_source?: "route" | "global" | "component";
  fingerprint?: string;
  client_event_id?: string;
  commit_sha?: string;
  build_timestamp?: string;
  client_commit_sha?: string;
  client_build_timestamp?: string;
  release_metadata_match?: boolean;
  browser?: string;
  has_targets?: boolean;
  has_food_logs?: boolean;
  target_load_state?: string;
  food_log_load_state?: string;
  duration_ms?: number;
  count?: number;
};

export function redactOperationalValue(value: unknown, key = "value", depth = 0): unknown {
  if (SENSITIVE_KEY.test(key)) return REDACTED;
  if (depth > 4) return "[MAX_DEPTH]";
  if (typeof value === "string") {
    const safeCorrelationId = CORRELATION_ID_KEY.test(key);
    return value
      .replace(BEARER, REDACTED)
      .replace(JWT, REDACTED)
      .replace(EMAIL, REDACTED)
      .replace(safeCorrelationId ? /$^/ : UUID, REDACTED)
      .replace(QUERY, "$1")
      .slice(0, 2500);
  }
  if (Array.isArray(value)) return value.slice(0, 25).map((item) => redactOperationalValue(item, key, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 50).map(([childKey, childValue]) => [childKey, redactOperationalValue(childValue, childKey, depth + 1)]));
  }
  return value;
}

export function serializeOperationalLog(log: OperationalLog) {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    service: "plaivra-web",
    ...redactOperationalValue(log, "log") as OperationalLog
  });
}

export function logOperationalEvent(log: OperationalLog) {
  const serialized = serializeOperationalLog(log);
  if (log.level === "error") console.error(serialized);
  else if (log.level === "warn") console.warn(serialized);
  else console.info(serialized);
}
