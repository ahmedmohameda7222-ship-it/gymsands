export type CatalogErrorCode =
  | "catalog_bad_request"
  | "catalog_not_configured"
  | "catalog_timeout"
  | "catalog_network_error"
  | "catalog_rate_limited"
  | "catalog_unauthorized"
  | "catalog_forbidden"
  | "catalog_not_found"
  | "catalog_upstream_error"
  | "catalog_invalid_response";

const statusByCode: Record<CatalogErrorCode, number> = {
  catalog_bad_request: 400,
  catalog_not_configured: 503,
  catalog_timeout: 504,
  catalog_network_error: 503,
  catalog_rate_limited: 503,
  catalog_unauthorized: 502,
  catalog_forbidden: 502,
  catalog_not_found: 404,
  catalog_upstream_error: 503,
  catalog_invalid_response: 502
};

const safeMessageByCode: Record<CatalogErrorCode, string> = {
  catalog_bad_request: "The catalog request is invalid.",
  catalog_not_configured: "The exercise catalog is not configured.",
  catalog_timeout: "The exercise catalog took too long to respond.",
  catalog_network_error: "The exercise catalog is temporarily unavailable.",
  catalog_rate_limited: "The exercise catalog is busy. Please try again shortly.",
  catalog_unauthorized: "The exercise catalog could not be authorized.",
  catalog_forbidden: "The exercise catalog refused the request.",
  catalog_not_found: "The requested exercise was not found.",
  catalog_upstream_error: "The exercise catalog is temporarily unavailable.",
  catalog_invalid_response: "The exercise catalog returned an invalid response."
};

export class CatalogError extends Error {
  readonly code: CatalogErrorCode;
  readonly status: number;
  readonly allowLegacyFallback: boolean;

  constructor(code: CatalogErrorCode, options: { allowLegacyFallback?: boolean; cause?: unknown } = {}) {
    super(safeMessageByCode[code], { cause: options.cause });
    this.name = "CatalogError";
    this.code = code;
    this.status = statusByCode[code];
    this.allowLegacyFallback = Boolean(options.allowLegacyFallback);
  }
}

export function asCatalogError(error: unknown) {
  return error instanceof CatalogError
    ? error
    : new CatalogError("catalog_upstream_error", { cause: error });
}
