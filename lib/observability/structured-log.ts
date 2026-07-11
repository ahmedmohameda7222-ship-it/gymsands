const REDACTED = "[REDACTED]";
const SENSITIVE_KEY = /(?:authorization|cookie|token|secret|password|email|address|name|prompt|notes?|diagnos|injur|allerg|weight|calorie|nutrition|body|photo|payload)/i;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

export type LogLevel = "info" | "warn" | "error";
export type OperationalLog = {
  event: string;
  level: LogLevel;
  request_id?: string;
  route?: string;
  outcome?: "success" | "error" | "ignored";
  error_code?: string;
  duration_ms?: number;
  count?: number;
};

export function redactOperationalValue(value: unknown, key = "value", depth = 0): unknown {
  if (SENSITIVE_KEY.test(key)) return REDACTED;
  if (depth > 4) return "[MAX_DEPTH]";
  if (typeof value === "string") return value.replace(BEARER, REDACTED).replace(EMAIL, REDACTED).slice(0, 500);
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
