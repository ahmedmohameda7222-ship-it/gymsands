import type { ActivityCatalogErrorCode } from "./types";

const safeMessages: Record<ActivityCatalogErrorCode, string> = {
  invalid_request: "The activity catalog request is invalid.",
  configuration_error: "The activity catalog is not configured correctly.",
  unavailable: "The activity catalog is temporarily unavailable.",
  timeout: "The activity catalog request timed out.",
  rate_limited: "The activity catalog is temporarily busy.",
  upstream_unauthorized: "The activity catalog could not authenticate the server request.",
  upstream_forbidden: "The activity catalog rejected the server request.",
  invalid_response: "The activity catalog returned an invalid response.",
  not_found: "The requested activity catalog item was not found."
};

export class ActivityCatalogError extends Error {
  readonly code: ActivityCatalogErrorCode;
  readonly status: number;
  readonly requestId?: string;

  constructor(
    code: ActivityCatalogErrorCode,
    options: { status?: number; requestId?: string; cause?: unknown; message?: string } = {}
  ) {
    super(options.message ?? safeMessages[code], { cause: options.cause });
    this.name = "ActivityCatalogError";
    this.code = code;
    this.status = options.status ?? activityCatalogErrorStatus(code);
    this.requestId = options.requestId;
  }
}

export function isActivityCatalogError(error: unknown): error is ActivityCatalogError {
  return error instanceof ActivityCatalogError;
}

export function activityCatalogErrorStatus(code: ActivityCatalogErrorCode) {
  switch (code) {
    case "invalid_request": return 400;
    case "upstream_unauthorized": return 502;
    case "upstream_forbidden": return 502;
    case "not_found": return 404;
    case "rate_limited": return 503;
    case "timeout": return 504;
    case "configuration_error": return 503;
    case "invalid_response": return 502;
    case "unavailable": return 503;
  }
}

export function safeActivityCatalogError(error: unknown, fallback: ActivityCatalogErrorCode = "unavailable") {
  if (isActivityCatalogError(error)) return error;
  if (error instanceof DOMException && error.name === "AbortError") return new ActivityCatalogError("timeout");
  return new ActivityCatalogError(fallback, { cause: error });
}
