export const REQUEST_ID_HEADER = "x-request-id";
export const CATALOG_REQUEST_GROUP_ID_HEADER = "x-plaivra-catalog-request-group-id";

const MAX_CORRELATION_ID_LENGTH = 128;
const CORRELATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export function isValidOperationalCorrelationId(value: string | null | undefined) {
  if (!value) return false;
  const clean = value.trim();
  return clean.length <= MAX_CORRELATION_ID_LENGTH && CORRELATION_ID.test(clean);
}

export function createOperationalCorrelationId() {
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    throw new Error("Secure correlation ID generation is unavailable.");
  }
  return globalThis.crypto.randomUUID();
}

export function resolveOperationalCorrelationId(value: string | null | undefined) {
  return isValidOperationalCorrelationId(value) ? value!.trim() : createOperationalCorrelationId();
}
