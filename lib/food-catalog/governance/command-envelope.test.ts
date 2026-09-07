import { describe, expect, it } from "vitest";
import { DEFAULT_FOOD_GOVERNANCE_CAPABILITIES, type FoodGovernancePrincipal } from "./principals";
import { buildGovernanceCommandEnvelope, assertReplaySemantics } from "./command-envelope";

const owner: FoodGovernancePrincipal = {
  id: "11111111-1111-4111-8111-111111111111",
  principalType: "human",
  subjectId: "owner-user",
  roleClass: "owner",
  capabilities: DEFAULT_FOOD_GOVERNANCE_CAPABILITIES.owner,
};

const OPERATION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FOOD_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("Food Catalog Plan 6 privileged command envelope", () => {
  it("derives stable semantic checksums from trusted normalized semantics", () => {
    const left = buildGovernanceCommandEnvelope({
      operationId: OPERATION_ID,
      principal: owner,
      capability: "food.nutrition.correct",
      commandName: "apply_nutrition_correction",
      targetFoodId: FOOD_ID,
      correctionCaseId: null,
      policyVersion: "plan6-v1",
      reason: "Correct label evidence",
      semantics: { nutrition: { protein_g: 10, calories: null }, basis: { unit: "g", amount: 100 } },
    });
    const right = buildGovernanceCommandEnvelope({
      operationId: OPERATION_ID,
      principal: owner,
      capability: "food.nutrition.correct",
      commandName: "apply_nutrition_correction",
      targetFoodId: FOOD_ID,
      correctionCaseId: null,
      policyVersion: "plan6-v1",
      reason: "Correct label evidence",
      semantics: { basis: { amount: 100, unit: "g" }, nutrition: { calories: null, protein_g: 10 } },
    });
    expect(left.semanticChecksumSha256).toBe(right.semanticChecksumSha256);
    expect(left.semanticChecksumSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("permits exact replay and rejects changed semantics under the same operation ID", () => {
    const current = buildGovernanceCommandEnvelope({
      operationId: OPERATION_ID,
      principal: owner,
      capability: "food.serving.correct",
      commandName: "apply_serving_correction",
      targetFoodId: FOOD_ID,
      correctionCaseId: null,
      policyVersion: "plan6-v1",
      reason: "Serving correction",
      semantics: { label: "1 cup", amount: 1 },
    });
    expect(assertReplaySemantics(current, current)).toEqual({ replay: true });
    const changed = buildGovernanceCommandEnvelope({
      ...current,
      principal: owner,
      semantics: { label: "2 cups", amount: 2 },
    });
    expect(() => assertReplaySemantics(current, changed)).toThrow(/different semantics/i);
  });

  it("rejects caller authority mismatches and malformed operation identities", () => {
    expect(() => buildGovernanceCommandEnvelope({
      operationId: "not-an-operation-id",
      principal: owner,
      capability: "food.ingestion.propose",
      commandName: "ingestion_proposal",
      targetFoodId: null,
      correctionCaseId: null,
      policyVersion: "plan6-v1",
      reason: "Proposal",
      semantics: {},
    })).toThrow(/operation id|capability denied/i);
  });
});
