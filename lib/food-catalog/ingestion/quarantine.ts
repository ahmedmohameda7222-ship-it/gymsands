import type {
  FoodCatalogCanonicalDecision,
  FoodCatalogValidationIssue
} from "./contracts";

export type FoodCatalogProcessingDisposition =
  | { kind: "accept"; reasonCodes: string[] }
  | { kind: "quarantine"; reasonCodes: string[] }
  | { kind: "reject"; reasonCodes: string[] };

export type DeriveProcessingDispositionInput = {
  decision: FoodCatalogCanonicalDecision;
  issues: readonly FoodCatalogValidationIssue[];
  conflictReasons: readonly string[];
};

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function quarantineWarningReason(issue: FoodCatalogValidationIssue): string | null {
  if (issue.severity !== "warning") return null;
  if (issue.code === "suspicious_calorie_macro_delta") return "nutrition_anomaly";
  return null;
}

export function deriveProcessingDisposition({
  decision,
  issues,
  conflictReasons
}: DeriveProcessingDispositionInput): FoodCatalogProcessingDisposition {
  const errorCodes = issues
    .filter((issue) => issue.severity === "error")
    .map((issue) => issue.code);

  if (decision.kind === "reject") {
    return {
      kind: "reject",
      reasonCodes: uniqueSorted([...decision.issueCodes, ...errorCodes])
    };
  }

  if (errorCodes.length > 0) {
    return { kind: "reject", reasonCodes: uniqueSorted(errorCodes) };
  }

  const quarantineReasons = [
    ...conflictReasons,
    ...issues
      .map(quarantineWarningReason)
      .filter((reason): reason is string => reason !== null)
  ];
  if (decision.kind === "possible_duplicate") quarantineReasons.push("possible_duplicate");

  const reasonCodes = uniqueSorted(quarantineReasons);
  if (reasonCodes.length > 0) return { kind: "quarantine", reasonCodes };
  return { kind: "accept", reasonCodes: [] };
}
