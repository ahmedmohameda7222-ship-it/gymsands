import { createHash } from "node:crypto";
import {
  assertFoodGovernanceCapability,
  type FoodGovernanceCapability,
  type FoodGovernancePrincipal,
} from "./principals";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function canonical(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Governance command semantics require finite numbers.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error("Governance command semantics require plain JSON objects.");
    }
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => {
        if (entry === undefined) throw new Error("Governance command semantics do not allow undefined.");
        return `${JSON.stringify(key)}:${canonical(entry)}`;
      })
      .join(",")}}`;
  }
  throw new Error("Governance command semantics must be canonical JSON.");
}

function required(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

export type FoodGovernanceCommandEnvelope = Readonly<{
  operationId: string;
  principalId: string;
  capability: FoodGovernanceCapability;
  commandName: string;
  targetFoodId: string | null;
  correctionCaseId: string | null;
  policyVersion: string;
  reason: string;
  semantics: unknown;
  semanticChecksumSha256: string;
}>;

export function buildGovernanceCommandEnvelope(input: {
  operationId: string;
  principal: FoodGovernancePrincipal;
  capability: FoodGovernanceCapability;
  commandName: string;
  targetFoodId: string | null;
  correctionCaseId: string | null;
  policyVersion: string;
  reason: string;
  semantics: unknown;
}): FoodGovernanceCommandEnvelope {
  if (!UUID.test(input.operationId)) throw new Error("Governance operation ID must be an exact UUID.");
  if (input.targetFoodId !== null && !UUID.test(input.targetFoodId)) throw new Error("Governance target Food ID must be an exact UUID.");
  if (input.correctionCaseId !== null && !UUID.test(input.correctionCaseId)) throw new Error("Governance correction case ID must be an exact UUID.");
  assertFoodGovernanceCapability(input.principal, input.capability);
  const commandName = required(input.commandName, "Governance command name");
  const policyVersion = required(input.policyVersion, "Governance policy version");
  const reason = required(input.reason, "Governance command reason");
  const normalizedSemantics = {
    capability: input.capability,
    commandName,
    targetFoodId: input.targetFoodId?.toLowerCase() ?? null,
    correctionCaseId: input.correctionCaseId?.toLowerCase() ?? null,
    policyVersion,
    reason,
    command: input.semantics,
  };
  const semanticChecksumSha256 = createHash("sha256")
    .update(canonical(normalizedSemantics), "utf8")
    .digest("hex");
  return Object.freeze({
    operationId: input.operationId.toLowerCase(),
    principalId: input.principal.id.toLowerCase(),
    capability: input.capability,
    commandName,
    targetFoodId: input.targetFoodId?.toLowerCase() ?? null,
    correctionCaseId: input.correctionCaseId?.toLowerCase() ?? null,
    policyVersion,
    reason,
    semantics: input.semantics,
    semanticChecksumSha256,
  });
}

export function assertReplaySemantics(
  existing: FoodGovernanceCommandEnvelope,
  requested: FoodGovernanceCommandEnvelope,
) {
  if (existing.operationId !== requested.operationId) throw new Error("Replay comparison requires the same operation ID.");
  if (existing.principalId !== requested.principalId
      || existing.capability !== requested.capability
      || existing.commandName !== requested.commandName
      || existing.semanticChecksumSha256 !== requested.semanticChecksumSha256) {
    throw new Error("Operation ID was already used with different semantics or authority.");
  }
  return { replay: true } as const;
}
