import "server-only";

import { createHash } from "node:crypto";

function serializeCanonical(value: unknown, ancestors: WeakSet<object>): string {
  if (value === null) return "null";

  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) {
        throw new TypeError("Canonical JSON numbers must be finite.");
      }
      return JSON.stringify(value);
    case "undefined":
      throw new TypeError("Canonical JSON does not support undefined.");
    case "function":
      throw new TypeError("Canonical JSON does not support functions.");
    case "symbol":
      throw new TypeError("Canonical JSON does not support symbols.");
    case "bigint":
      throw new TypeError("Canonical JSON does not support bigint values.");
    case "object":
      break;
    default:
      throw new TypeError("Canonical JSON value is unsupported.");
  }

  const objectValue = value as object;
  if (ancestors.has(objectValue)) {
    throw new TypeError("Canonical JSON does not support cyclic structures.");
  }
  ancestors.add(objectValue);

  try {
    if (Array.isArray(value)) {
      return `[${value.map((entry) => serializeCanonical(entry, ancestors)).join(",")}]`;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Canonical JSON supports only plain objects and arrays.");
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new TypeError("Canonical JSON does not support symbol keys.");
    }

    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${serializeCanonical(record[key], ancestors)}`);
    return `{${entries.join(",")}}`;
  } finally {
    ancestors.delete(objectValue);
  }
}

export function canonicalStringify(value: unknown): string {
  return serializeCanonical(value, new WeakSet<object>());
}

export function sha256Canonical(value: unknown): string {
  return createHash("sha256").update(canonicalStringify(value), "utf8").digest("hex");
}
