import { createHash } from "node:crypto";

export type LosslessPostgresScalar = Readonly<{
  pgType: string;
  text: string | null;
}>;

const DECIMAL = /^([+-]?)(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/;
const TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(?:(Z)|([+-])(\d{2})(?::?(\d{2}))?)?$/;

export function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function canonicalizeDecimalText(input: string): string {
  const value = input.trim();
  const match = DECIMAL.exec(value);
  if (!match) throw new Error(`Invalid PostgreSQL decimal text: ${input}`);
  const [, signToken, integer, fraction = "", exponentText = "0"] = match;
  const exponent = Number.parseInt(exponentText, 10);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 1_000_000) {
    throw new Error("PostgreSQL decimal exponent is outside the canonicalization safety bound.");
  }

  const digits = `${integer}${fraction}`;
  const point = integer.length + exponent;
  let whole: string;
  let decimal: string;
  if (point <= 0) {
    whole = "0";
    decimal = `${"0".repeat(-point)}${digits}`;
  } else if (point >= digits.length) {
    whole = `${digits}${"0".repeat(point - digits.length)}`;
    decimal = "";
  } else {
    whole = digits.slice(0, point);
    decimal = digits.slice(point);
  }

  whole = whole.replace(/^0+(?=\d)/, "");
  decimal = decimal.replace(/0+$/, "");
  const nonZero = /[1-9]/.test(`${whole}${decimal}`);
  const sign = signToken === "-" && nonZero ? "-" : "";
  return `${sign}${whole || "0"}${decimal ? `.${decimal}` : ""}`;
}

function canonicalizeTimestampText(input: string, withTimezone: boolean): string {
  const match = TIMESTAMP.exec(input.trim());
  if (!match) throw new Error(`Invalid PostgreSQL timestamp text: ${input}`);
  const [, year, month, day, hour, minute, second, fraction = "", zulu, sign, offsetHour = "00", offsetMinute = "00"] = match;
  const micros = fraction.padEnd(6, "0");

  if (!withTimezone) {
    if (zulu || sign) throw new Error("timestamp without time zone cannot contain a zone offset.");
    return `${year}-${month}-${day}T${hour}:${minute}:${second}.${micros}`;
  }

  const direction = sign === "-" ? -1 : 1;
  const offset = zulu ? 0 : direction * (Number(offsetHour) * 60 + Number(offsetMinute));
  const utcMillis = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    0,
  ) - offset * 60_000;
  if (!Number.isFinite(utcMillis)) throw new Error("Timestamp is outside the supported PostgreSQL portability range.");
  const utcSecond = new Date(utcMillis).toISOString().slice(0, 19);
  return `${utcSecond}.${micros}Z`;
}

type JsonNode =
  | { kind: "null" }
  | { kind: "boolean"; value: boolean }
  | { kind: "string"; value: string }
  | { kind: "number"; value: string }
  | { kind: "array"; value: JsonNode[] }
  | { kind: "object"; value: Map<string, JsonNode> };

class LosslessJsonParser {
  private index = 0;

  constructor(private readonly source: string) {}

  parse(): JsonNode {
    const value = this.readValue();
    this.skipWhitespace();
    if (this.index !== this.source.length) throw new Error("Trailing JSON content is not allowed.");
    return value;
  }

  private skipWhitespace() {
    while (/\s/.test(this.source[this.index] ?? "")) this.index += 1;
  }

  private readValue(): JsonNode {
    this.skipWhitespace();
    const char = this.source[this.index];
    if (char === '"') return { kind: "string", value: this.readString() };
    if (char === "[") return this.readArray();
    if (char === "{") return this.readObject();
    if (this.source.startsWith("true", this.index)) { this.index += 4; return { kind: "boolean", value: true }; }
    if (this.source.startsWith("false", this.index)) { this.index += 5; return { kind: "boolean", value: false }; }
    if (this.source.startsWith("null", this.index)) { this.index += 4; return { kind: "null" }; }
    return this.readNumber();
  }

  private readString(): string {
    const start = this.index;
    this.index += 1;
    let escaped = false;
    while (this.index < this.source.length) {
      const char = this.source[this.index];
      this.index += 1;
      if (escaped) { escaped = false; continue; }
      if (char === "\\") { escaped = true; continue; }
      if (char === '"') {
        const token = this.source.slice(start, this.index);
        return JSON.parse(token) as string;
      }
    }
    throw new Error("Unterminated JSON string.");
  }

  private readNumber(): JsonNode {
    const start = this.index;
    while (/[0-9eE+.-]/.test(this.source[this.index] ?? "")) this.index += 1;
    const token = this.source.slice(start, this.index);
    if (!token || !DECIMAL.test(token)) throw new Error(`Invalid JSON numeric token: ${token || "<empty>"}`);
    return { kind: "number", value: canonicalizeDecimalText(token) };
  }

  private readArray(): JsonNode {
    this.index += 1;
    const values: JsonNode[] = [];
    this.skipWhitespace();
    if (this.source[this.index] === "]") { this.index += 1; return { kind: "array", value: values }; }
    for (;;) {
      values.push(this.readValue());
      this.skipWhitespace();
      const delimiter = this.source[this.index];
      this.index += 1;
      if (delimiter === "]") return { kind: "array", value: values };
      if (delimiter !== ",") throw new Error("Invalid JSON array delimiter.");
    }
  }

  private readObject(): JsonNode {
    this.index += 1;
    const values = new Map<string, JsonNode>();
    this.skipWhitespace();
    if (this.source[this.index] === "}") { this.index += 1; return { kind: "object", value: values }; }
    for (;;) {
      this.skipWhitespace();
      if (this.source[this.index] !== '"') throw new Error("JSON object key must be a string.");
      const key = this.readString();
      if (values.has(key)) throw new Error("Duplicate JSON object keys are not accepted by the portability canonicalizer.");
      this.skipWhitespace();
      if (this.source[this.index] !== ":") throw new Error("Invalid JSON object separator.");
      this.index += 1;
      values.set(key, this.readValue());
      this.skipWhitespace();
      const delimiter = this.source[this.index];
      this.index += 1;
      if (delimiter === "}") return { kind: "object", value: values };
      if (delimiter !== ",") throw new Error("Invalid JSON object delimiter.");
    }
  }
}

function serializeJsonNode(node: JsonNode): string {
  switch (node.kind) {
    case "null": return "null";
    case "boolean": return node.value ? "true" : "false";
    case "string": return JSON.stringify(node.value);
    case "number": return node.value;
    case "array": return `[${node.value.map(serializeJsonNode).join(",")}]`;
    case "object": return `{${[...node.value.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${JSON.stringify(key)}:${serializeJsonNode(value)}`)
      .join(",")}}`;
  }
}

export function canonicalizeLosslessJsonText(input: string): string {
  return serializeJsonNode(new LosslessJsonParser(input).parse());
}

export function canonicalizePostgresScalar(scalar: LosslessPostgresScalar): string {
  const pgType = scalar.pgType.trim().toLowerCase().replace(/^pg_catalog\./, "");
  if (scalar.text === null) return "null";
  const text = scalar.text;

  if (["numeric", "decimal"].includes(pgType)) return canonicalizeDecimalText(text);
  if (["int8", "bigint", "int4", "integer", "int2", "smallint"].includes(pgType)) {
    if (!/^[+-]?\d+$/.test(text.trim())) throw new Error(`Invalid PostgreSQL integer text: ${text}`);
    return canonicalizeDecimalText(text);
  }
  if (pgType === "jsonb" || pgType === "json") return canonicalizeLosslessJsonText(text);
  if (pgType === "timestamptz" || pgType === "timestamp with time zone") return canonicalizeTimestampText(text, true);
  if (pgType === "timestamp" || pgType === "timestamp without time zone") return canonicalizeTimestampText(text, false);
  if (pgType === "uuid") return text.trim().toLowerCase();
  if (pgType === "bool" || pgType === "boolean") {
    if (["t", "true"].includes(text.toLowerCase())) return "true";
    if (["f", "false"].includes(text.toLowerCase())) return "false";
    throw new Error(`Invalid PostgreSQL boolean text: ${text}`);
  }
  if (pgType === "bytea") return text.trim().toLowerCase();
  return text;
}

export function canonicalizeLosslessRow(
  row: Readonly<Record<string, LosslessPostgresScalar>>,
  columnOrder: readonly string[] = Object.keys(row).sort(),
): string {
  return `[${columnOrder.map((column) => {
    const scalar = row[column];
    if (!scalar) throw new Error(`Missing lossless scalar for column ${column}.`);
    return JSON.stringify([column, scalar.pgType.toLowerCase(), canonicalizePostgresScalar(scalar)]);
  }).join(",")}]`;
}
