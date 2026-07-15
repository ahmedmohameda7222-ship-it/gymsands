import { describe, expect, it } from "vitest";
import { CatalogError } from "./errors";
import { parseActivityEnvelope, parseAlternativesEnvelope, parseSearchEnvelope } from "./validation";

const activityId = "11111111-1111-4111-8111-111111111111";
const sportId = "22222222-2222-4222-8222-222222222222";
const taxonomyId = "33333333-3333-4333-8333-333333333333";
const taxonomy = { id: taxonomyId, slug: "strength", name: "Strength" };
const meta = { apiVersion: "v1", locale: "en", requestId: "request-1" };

function realShapedActivity() {
  return {
    id: activityId,
    slug: "barbell_squat",
    name: "Barbell squat",
    shortDescription: null as string | null,
    instructions: [
      { order: 1, text: "Brace the trunk." },
      { order: 2, text: "Descend under control." }
    ],
    difficulty: "intermediate",
    movementPattern: "squat",
    version: 3,
    activityType: taxonomy,
    metricSchema: {
      slug: "strength_sets",
      name: "Strength sets",
      fields: [
        { key: "reps", label: "Repetitions", type: "integer", unit: null, required: true },
        { key: "load", label: "Load", type: "number", unit: "kg", required: false }
      ]
    } as Record<string, unknown> | null,
    sports: [{ id: sportId, slug: "strength_training", name: "Strength training", isPrimary: true }],
    sessionTypes: [{ id: taxonomyId, slug: "strength_session", name: "Strength session", sportId }],
    sessionPhases: [{ id: taxonomyId, slug: "main_work", name: "Main work", sportId, isOptional: false }],
    equipment: [{ id: taxonomyId, slug: "barbell", name: "Barbell", isRequired: true }],
    muscles: [{ id: taxonomyId, slug: "quadriceps", name: "Quadriceps", bodyRegion: "lower_body", role: "primary" }],
    trainingGoals: [{ id: taxonomyId, slug: "strength", name: "Strength", relevanceWeight: 0.85 }],
    translations: {
      de: { name: "Langhantelkniebeuge", shortDescription: null, instructions: [{ order: 1, text: "Rumpf anspannen." }] },
      ar: { name: "قرفصاء بالبار" }
    },
    publishedAt: "2026-06-01T08:30:00.000Z" as string | undefined,
    updatedAt: "2026-07-15T00:00:00.000Z"
  };
}

describe("Activity Catalog OpenAPI runtime validation", () => {
  it("accepts a representative real-shaped activity without discarding contract fields", () => {
    const parsed = parseActivityEnvelope({ data: realShapedActivity(), meta });
    expect(parsed.data.trainingGoals[0].relevanceWeight).toBe(0.85);
    expect(parsed.data.translations.de.shortDescription).toBeNull();
    expect(parsed.data.instructions.map((step) => step.order)).toEqual([1, 2]);
    expect(parsed.data.metricSchema?.fields?.[1]).toMatchObject({ key: "load", unit: "kg", required: false });
    expect(parsed.data.publishedAt).toBe("2026-06-01T08:30:00.000Z");
    expect(parsed.data.updatedAt).toBe("2026-07-15T00:00:00.000Z");
  });

  it("accepts real-shaped pagination and preserves its next offset", () => {
    const parsed = parseSearchEnvelope({ data: [realShapedActivity()], pagination: { limit: 25, offset: 50, returned: 1, nextOffset: 75 }, meta });
    expect(parsed.pagination).toEqual({ limit: 25, offset: 50, returned: 1, nextOffset: 75 });
  });

  it("accepts a null metric schema and omitted optional nullable fields", () => {
    const source = realShapedActivity();
    const { shortDescription: _description, publishedAt: _publishedAt, ...withoutOptional } = source;
    const parsed = parseActivityEnvelope({ data: { ...withoutOptional, metricSchema: null }, meta });
    expect(parsed.data.shortDescription).toBeUndefined();
    expect(parsed.data.publishedAt).toBeUndefined();
    expect(parsed.data.metricSchema).toBeNull();
  });

  it("accepts live alternatives with nullable optional differences", () => {
    const parsed = parseAlternativesEnvelope({
      data: [{
        sourceActivityId: activityId,
        alternativeActivityId: "44444444-4444-4444-8444-444444444444",
        alternativeSlug: "goblet_squat",
        alternativeName: "Goblet squat",
        alternativeActivityTypeSlug: "strength",
        alternativeDifficulty: null,
        reasonCode: "equipment",
        differenceSummary: null,
        prescriptionTransfer: "partial",
        compatibilityScore: 0.9,
        priority: 1
      }],
      meta
    });
    expect(parsed.data[0]).toMatchObject({ alternativeSlug: "goblet_squat", compatibilityScore: 0.9, priority: 1 });
  });

  it.each([-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY])("rejects malformed relevance weight %s", (relevanceWeight) => {
    const activity = realShapedActivity();
    activity.trainingGoals[0].relevanceWeight = relevanceWeight;
    expect(() => parseActivityEnvelope({ data: activity, meta })).toThrowError(CatalogError);
  });

  it("rejects upstream additions rather than silently trusting unchecked JSON", () => {
    expect(() => parseActivityEnvelope({ data: { ...realShapedActivity(), privateUserNote: "must not pass" }, meta })).toThrowError(CatalogError);
  });
});
