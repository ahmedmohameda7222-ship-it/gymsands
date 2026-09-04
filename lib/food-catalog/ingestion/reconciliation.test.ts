import { describe, expect, it } from "vitest";
import type { FoodCatalogExpectedMutationCounts } from "./contracts";
import type {
  FoodCatalogExecutionReconciliationInput,
  FoodCatalogObservedExecutionResult
} from "./reconciliation";
import { reconcileFoodCatalogExecution } from "./reconciliation";

const counts = (
  overrides: Partial<FoodCatalogExpectedMutationCounts> = {}
): FoodCatalogExpectedMutationCounts => ({
  input: 2,
  accepted: 1,
  rejected: 0,
  matched: 0,
  created: 1,
  possibleDuplicate: 1,
  quarantined: 1,
  ...overrides
});

const expected = (): FoodCatalogExecutionReconciliationInput["expected"] => ({
  manifestContentChecksumSha256: "a".repeat(64),
  semanticBatchIdentityChecksumSha256: "b".repeat(64),
  sourceRecordIds: ["a", "b"],
  quarantinedSourceRecordIds: ["b"],
  expectedMutations: counts()
});

const result = (
  sourceRecordId: string,
  decisionKind: FoodCatalogObservedExecutionResult["decisionKind"],
  dispositionKind: FoodCatalogObservedExecutionResult["dispositionKind"],
  idempotencyKey = `op-${sourceRecordId}`
): FoodCatalogObservedExecutionResult => ({
  sourceRecordId,
  decisionKind,
  dispositionKind,
  idempotencyKey
});

describe("Food Catalog Plan 4 expected-vs-observed reconciliation", () => {
  it("passes only an exact complete execution", () => {
    const report = reconcileFoodCatalogExecution({
      expected: expected(),
      observed: {
        manifestContentChecksumSha256: "a".repeat(64),
        semanticBatchIdentityChecksumSha256: "b".repeat(64),
        completed: true,
        results: [
          result("a", "create", "accept"),
          result("b", "possible_duplicate", "quarantine")
        ]
      }
    });

    expect(report).toEqual({ ok: true, issueCodes: [] });
  });

  it("fails closed on the approved manifest/write/idempotency/completion/quarantine/count mismatch classes", () => {
    const input: FoodCatalogExecutionReconciliationInput = {
      expected: expected(),
      observed: {
        manifestContentChecksumSha256: "c".repeat(64),
        semanticBatchIdentityChecksumSha256: "d".repeat(64),
        completed: false,
        results: [
          result("b", "possible_duplicate", "accept", "op-b-1"),
          result("b", "possible_duplicate", "accept", "op-b-2"),
          result("c", "create", "accept", "op-c")
        ]
      }
    };

    const report = reconcileFoodCatalogExecution(input);
    expect(report.ok).toBe(false);
    expect(report.issueCodes).toEqual([
      "manifest_checksum_mismatch",
      "missing_expected_write",
      "unexpected_extra_write",
      "duplicate_semantic_result",
      "idempotency_mismatch",
      "partial_execution",
      "quarantine_divergence",
      "outcome_count_mismatch"
    ]);
    expect(reconcileFoodCatalogExecution({
      ...input,
      observed: { ...input.observed, results: [...input.observed.results].reverse() }
    })).toEqual(report);
  });

  it("treats semantic batch identity mismatch as an idempotency failure even when record counts look exact", () => {
    const report = reconcileFoodCatalogExecution({
      expected: expected(),
      observed: {
        manifestContentChecksumSha256: "a".repeat(64),
        semanticBatchIdentityChecksumSha256: "e".repeat(64),
        completed: true,
        results: [
          result("a", "create", "accept"),
          result("b", "possible_duplicate", "quarantine")
        ]
      }
    });

    expect(report).toEqual({ ok: false, issueCodes: ["idempotency_mismatch"] });
  });

  it("reports duplicate execution separately from changed idempotency evidence", () => {
    const duplicate = result("a", "create", "accept", "same-key");
    const report = reconcileFoodCatalogExecution({
      expected: {
        ...expected(),
        sourceRecordIds: ["a"],
        quarantinedSourceRecordIds: [],
        expectedMutations: counts({ input: 1, possibleDuplicate: 0, quarantined: 0 })
      },
      observed: {
        manifestContentChecksumSha256: "a".repeat(64),
        semanticBatchIdentityChecksumSha256: "b".repeat(64),
        completed: true,
        results: [duplicate, { ...duplicate }]
      }
    });

    expect(report.issueCodes).toContain("duplicate_semantic_result");
    expect(report.issueCodes).not.toContain("idempotency_mismatch");
  });
});
