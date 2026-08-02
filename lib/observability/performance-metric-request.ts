export const MAX_PERFORMANCE_METRIC_BODY_BYTES = 4 * 1024;

export type ParsedPerformanceMetricRequest =
  | { ok: true; payload: unknown }
  | { ok: false; status: 400 | 413 | 415 };

export function parsePerformanceMetricRequestBody({
  contentType,
  contentLength,
  raw,
}: {
  contentType?: string | null;
  contentLength?: string | null;
  raw: string;
}): ParsedPerformanceMetricRequest {
  const mediaType = contentType?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") return { ok: false, status: 415 };

  const declaredLength = Number(contentLength ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_PERFORMANCE_METRIC_BODY_BYTES) {
    return { ok: false, status: 413 };
  }
  if (!raw) return { ok: false, status: 400 };
  if (new TextEncoder().encode(raw).byteLength > MAX_PERFORMANCE_METRIC_BODY_BYTES) {
    return { ok: false, status: 413 };
  }

  try {
    return { ok: true, payload: JSON.parse(raw) };
  } catch {
    return { ok: false, status: 400 };
  }
}
