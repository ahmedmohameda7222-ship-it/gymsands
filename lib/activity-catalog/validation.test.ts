import { describe, expect, it } from "vitest";
import { CatalogError } from "./errors";
import { parseActivityEnvelope, parseAlternativesEnvelope } from "./validation";

const id = "11111111-1111-4111-8111-111111111111";
const taxonomy = { id, slug: "strength", name: "Strength" };
const meta = { apiVersion: "v1", locale: "en", requestId: "request-1" };

function activity() {
  return {
    id,
    slug: "barbell_squat",
    name: "Barbell squat",
    instructions: [{ order: 1, text: "Brace" }],
    difficulty: null,
    movementPattern: null,
    version: 1,
    activityType: taxonomy,
    metricSchema: { fields: [{ key: "reps", label: "Reps", type: "integer", required: true }] },
    sports: [{ ...taxonomy, isPrimary: true }],
    sessionTypes: [{ ...taxonomy, sportId: id }],
    sessionPhases: [{ ...taxonomy, sportId: id, isOptional: false }],
    equipment: [{ ...taxonomy, isRequired: true }],
    muscles: [{ ...taxonomy, role: "primary" }],
    trainingGoals: [{ ...taxonomy, relevanceWeight: 1 }],
    translations: { de: {} },
    updatedAt: "2026-07-15T00:00:00.000Z"
  };
}

describe("Activity Catalog OpenAPI runtime validation", () => {
  it("accepts omitted optional nullable activity fields and partial metric schemas", () => {
    const parsed = parseActivityEnvelope({ data: activity(), meta });
    expect(parsed.data.shortDescription).toBeUndefined();
    expect(parsed.data.publishedAt).toBeUndefined();
    expect(parsed.data.metricSchema).toEqual({ fields: [{ key: "reps", label: "Reps", type: "integer", required: true }] });
  });

  it("accepts a null metric schema", () => {
    expect(parseActivityEnvelope({ data: { ...activity(), metricSchema: null }, meta }).data.metricSchema).toBeNull();
  });

  it("requires the exact v1 response metadata contract", () => {
    expect(() => parseActivityEnvelope({ data: activity(), meta: { ...meta, apiVersion: "v2" } })).toThrowError(CatalogError);
  });

  it("rejects upstream additions to TrainingActivity rather than trusting unchecked JSON", () => {
    expect(() => parseActivityEnvelope({ data: { ...activity(), privateUserNote: "must not pass" }, meta })).toThrowError(CatalogError);
  });

  it("uses the live ActivityAlternative shape with optional nullable fields", () => {
    const parsed = parseAlternativesEnvelope({
      data: [{
        sourceActivityId: id,
        alternativeActivityId: "22222222-2222-4222-8222-222222222222",
        alternativeSlug: "goblet_squat",
        alternativeName: "Goblet squat",
        reasonCode: "equipment",
        prescriptionTransfer: "partial",
        compatibilityScore: 0.9,
        priority: 1
      }],
      meta
    });
    expect(parsed.data[0].alternativeDifficulty).toBeUndefined();
    expect(parsed.data[0].differenceSummary).toBeUndefined();
  });
});

