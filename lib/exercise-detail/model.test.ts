import { describe, expect, it } from "vitest";
import type {
  LibraryActivityDetail,
  LibraryProviderMeta,
} from "@/lib/activity-catalog/library-types";
import type { Workout } from "@/types";
import {
  addToPlanActivityPayload,
  catalogActivityDetailModel,
  planExerciseDetailModel,
} from "./model";

const activity: LibraryActivityDetail = {
  id: "11111111-1111-4111-8111-111111111111",
  revisionId: "22222222-2222-4222-8222-222222222222",
  revisionNumber: 2,
  revisionLifecycle: "published",
  slug: "bench-press",
  name: "Bench Press",
  shortDescription: "A horizontal press.",
  instructions: [
    { order: 2, text: "Press upward." },
    { order: 1, text: "Set your position." },
  ],
  difficulty: "Intermediate",
  movementPattern: "Horizontal push",
  activityType: { slug: "strength", name: "Strength" },
  membership: {
    kind: "owned",
    visibility: "default",
    domainPriority: 1,
    primaryDomain: true,
  },
  aliases: [],
  equipment: [{ slug: "barbell", name: "Barbell", requirement: "required" }],
  coverage: [
    { name: "Chest", role: "primary" },
    { name: "Triceps", role: "secondary" },
  ],
  executionProfiles: [],
  bodyEffects: [],
  prescriptionSchema: {
    id: "33333333-3333-4333-8333-333333333333",
    key: "strength_sets_reps",
    version: 1,
    checksum: "c".repeat(64),
    fields: [
      {
        key: "sets",
        label: "Sets",
        type: "integer",
        required: true,
        min: 1,
        max: 20,
      },
    ],
  },
  performedMetricSchema: {
    id: "44444444-4444-4444-8444-444444444444",
    key: "strength_performed",
    version: 1,
    checksum: "d".repeat(64),
    fields: [],
  },
  recordDefinitions: [
    {
      id: "55555555-5555-4555-8555-555555555555",
      recordKey: "highest_load",
      comparisonDirection: "higher_better",
      canonicalUnit: "kg",
    },
  ],
  heatMap: { mapping: [{ muscleName: "Chest", role: "primary" }] },
  publicationPolicy: {
    id: "66666666-6666-4666-8666-666666666666",
    key: "public",
    version: 1,
    checksum: "e".repeat(64),
  },
  capabilityContract: {
    id: "77777777-7777-4777-8777-777777777777",
    version: "1",
    compatibleCatalogApiVersion: "v2",
    checksum: "f".repeat(64),
  },
  authority: {
    libraryRelease: {
      id: "88888888-8888-4888-8888-888888888888",
      version: "2026.08",
      checksum: "a".repeat(64),
    },
    catalogRelease: {
      id: "99999999-9999-4999-8999-999999999999",
      version: "2026.08",
      checksum: "b".repeat(64),
    },
    activityId: "11111111-1111-4111-8111-111111111111",
    revisionId: "22222222-2222-4222-8222-222222222222",
    revisionNumber: 2,
  },
};
const nativeMeta: LibraryProviderMeta = {
  apiVersion: "v2",
  locale: "en",
  source: "library_v2",
  degraded: false,
  libraryRelease: {
    id: "88888888-8888-4888-8888-888888888888",
    version: "2026.08",
    checksum: "a".repeat(64),
    publishedAt: "2026-08-01",
    strengthSemanticFingerprint: "x",
  },
  catalogRelease: {
    id: "99999999-9999-4999-8999-999999999999",
    version: "2026.08",
    checksum: "b".repeat(64),
  },
};

describe("Exercise Detail canonical model", () => {
  it("preserves identity, ordered instructions, targets and authoritative prescription without enabling an inferred Start", () => {
    const model = catalogActivityDetailModel(activity, nativeMeta, "strength");
    expect(model.identity).toMatchObject({
      activityId: activity.id,
      revisionId: activity.revisionId,
      source: "catalog_v2",
    });
    expect(model.instructions.map((step) => step.order)).toEqual([1, 2]);
    expect(model.target).toMatchObject({
      kind: "muscle",
      primary: ["Chest"],
      secondary: ["Triceps"],
      anatomyAvailable: true,
    });
    expect(model.prescription?.fields[0]).toMatchObject({
      key: "sets",
      required: true,
      minimum: 1,
      maximum: 20,
    });
    expect(model.startHref).toBeNull();
    expect(model.catalogAuthoritySnapshot?.revisionId).toBe(
      activity.revisionId,
    );
  });

  it("restricts Start to the proven legacy Strength runtime and does not force muscle semantics on other domains", () => {
    const legacyMeta: LibraryProviderMeta = {
      ...nativeMeta,
      apiVersion: "v1-compat",
      source: "legacy",
      libraryRelease: null,
      catalogRelease: null,
    };
    expect(
      catalogActivityDetailModel(
        { ...activity, authority: undefined },
        legacyMeta,
        "strength",
      ).startHref,
    ).toBe(`/workouts/session/${activity.id}`);
    const run = catalogActivityDetailModel(
      {
        ...activity,
        authority: undefined,
        coverage: [],
        heatMap: { policy: "not_applicable" },
      },
      legacyMeta,
      "running",
    );
    expect(run.target.kind).toBe("none");
    expect(run.startHref).toBeNull();
  });

  it("materializes native V2 with immutable authority and no prescription defaults", () => {
    const resolved = {
      core: catalogActivityDetailModel(activity, nativeMeta, "strength"),
      catalog: { detail: activity, meta: nativeMeta, domain: "strength" },
      initialCustomVideoUrl: null,
    };
    const payload = addToPlanActivityPayload(resolved);
    expect(payload.catalogSource).toBe("external");
    expect(payload.catalogAuthoritySnapshot?.activityId).toBe(activity.id);
    expect(payload.prescriptionSchema).toMatchObject({
      key: "strength_sets_reps",
    });
    expect(JSON.stringify(payload)).not.toMatch(
      /8-12|"sets":3|rest_seconds.*75/,
    );
  });

  it("preserves a plan exercise's null prescription and saved content", () => {
    const exercise: Workout = {
      id: activity.id,
      plan_exercise_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "Saved Bench",
      category: "Strength",
      target_muscle: "Chest",
      equipment: "Barbell",
      difficulty: "",
      sets: null,
      reps: null,
      rest_seconds: null,
      instructions: "Saved instruction",
      notes: "Saved note",
      is_global: true,
    };
    const model = planExerciseDetailModel({
      exercise,
      planId: "plan",
      planName: "Plan",
      dayId: "day",
      dayName: "Day",
    });
    expect(model.prescription).toEqual([]);
    expect(model.instructions).toBe("Saved instruction");
    expect(model.note).toBe("Saved note");
    expect(model.canonicalHref).toBe(`/workouts/${activity.id}`);
  });
});
