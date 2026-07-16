import "server-only";

import { CatalogError, asCatalogError, type CatalogErrorCode, type CatalogFailureStage } from "@/lib/activity-catalog/errors";
import type { CatalogProviderMode, CatalogResult } from "@/lib/activity-catalog/types";

export type ActivityCatalogProviderUsed = "legacy" | "external" | "none";
export type ActivityCatalogFallbackReason =
  | "none"
  | "external_timeout"
  | "external_network_error"
  | "external_rate_limited"
  | "external_upstream_5xx"
  | "external_not_found";
export type ActivityCatalogFallbackStage = "none" | CatalogFailureStage;

export type ActivityCatalogExecutionMetadata = {
  providerRequested?: CatalogProviderMode;
  providerUsed: ActivityCatalogProviderUsed;
  fallbackOccurred: boolean;
  fallbackReason: ActivityCatalogFallbackReason;
  fallbackStage: ActivityCatalogFallbackStage;
  providerDurationMs: number;
  errorCode?: CatalogErrorCode;
};

export type ActivityCatalogExecutionObserver = {
  readonly metadata: ActivityCatalogExecutionMetadata;
  providerRequested(mode: CatalogProviderMode): void;
  providerStarted(): void;
  fallbackSucceeded(error: CatalogError): void;
  providerCompleted<T>(result: CatalogResult<T>, durationMs: number): void;
  providerFailed(error: unknown, durationMs: number): void;
};

export function configuredActivityCatalogProviderMode(
  value: string | undefined = process.env.PLAIVRA_ACTIVITY_CATALOG_MODE
): CatalogProviderMode | undefined {
  if (!value || value === "legacy") return "legacy";
  if (value === "external" || value === "external_with_legacy_fallback") return value;
  return undefined;
}

export function classifyActivityCatalogFallbackReason(error: CatalogError): ActivityCatalogFallbackReason {
  switch (error.code) {
    case "catalog_timeout": return "external_timeout";
    case "catalog_network_error": return "external_network_error";
    case "catalog_rate_limited": return "external_rate_limited";
    case "catalog_upstream_error": return "external_upstream_5xx";
    case "catalog_not_found": return "external_not_found";
    default: return "none";
  }
}

export function classifyActivityCatalogFailureStage(error: unknown): ActivityCatalogFallbackStage {
  if (!(error instanceof CatalogError)) return "provider_request";
  if (error.failureStage) return error.failureStage;
  switch (error.code) {
    case "catalog_timeout":
    case "catalog_network_error":
    case "catalog_not_configured":
      return "provider_request";
    case "catalog_invalid_response":
      return "response_validation";
    default:
      return "response_status";
  }
}

function roundedDuration(durationMs: number) {
  return Math.max(0, Math.round(durationMs));
}

export function createActivityCatalogExecutionObserver(
  initialProviderRequested: CatalogProviderMode | undefined = configuredActivityCatalogProviderMode()
): ActivityCatalogExecutionObserver {
  const metadata: ActivityCatalogExecutionMetadata = {
    ...(initialProviderRequested ? { providerRequested: initialProviderRequested } : {}),
    providerUsed: "none",
    fallbackOccurred: false,
    fallbackReason: "none",
    fallbackStage: "none",
    providerDurationMs: 0
  };

  return {
    metadata,
    providerRequested(mode) {
      metadata.providerRequested = mode;
    },
    providerStarted() {
      metadata.providerUsed = "none";
      metadata.fallbackOccurred = false;
      metadata.fallbackReason = "none";
      metadata.fallbackStage = "none";
      metadata.providerDurationMs = 0;
      delete metadata.errorCode;
    },
    fallbackSucceeded(error) {
      metadata.fallbackOccurred = true;
      metadata.fallbackReason = classifyActivityCatalogFallbackReason(error);
      metadata.fallbackStage = classifyActivityCatalogFailureStage(error);
    },
    providerCompleted(result, durationMs) {
      metadata.providerUsed = result.meta.source;
      metadata.providerDurationMs = roundedDuration(durationMs);
      delete metadata.errorCode;
    },
    providerFailed(error, durationMs) {
      const safe = asCatalogError(error);
      metadata.providerUsed = "none";
      metadata.fallbackOccurred = false;
      metadata.fallbackReason = "none";
      metadata.fallbackStage = metadata.providerRequested === "legacy"
        ? "provider_request"
        : classifyActivityCatalogFailureStage(error);
      metadata.providerDurationMs = roundedDuration(durationMs);
      metadata.errorCode = safe.code;
    }
  };
}
