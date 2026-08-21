import { describe, expect, it } from "vitest";
import type { LibraryActivityDetail, LibraryProviderMeta } from "@/lib/activity-catalog/library-types";
import type { Workout } from "@/types";
import { addToPlanActivityPayload, catalogActivityDetailModel, customExerciseDetailModel, planExerciseDetailModel } from "./model";

const activity: LibraryActivityDetail = {
  id: "11111111-1111-4111-8111-111111111111",
  domain: "strength",
  revisionId: "22222222-2222-4222-8222-222222222222",
  revisionNumber: 2,
  revisionLifecycle: "published",
  slug: "bench_press",
  name: "Bench Press",
  shortDescription: "A horizontal press.",
  instructions: [{ order: 2, text: "Press upward." }, { order: 1, text: "Set your position." }],
  difficulty: "Intermediate",
  movementPattern: "Horizontal push",
  mechanics: "compound",
  forceType: "push",
  activityType: { slug: "strength", name: "Strength" },
  membership: { kind: "owned", visibility: "default", domainPriority: 1, primaryDomain: true },
  aliases: [],
  equipment: [
    { slug: "barbell", name: "Barbell", requirement: "required" },
    { slug: "bench", name: "Bench", requirement: "optional" },
  ],
  coverage: [
    { slug: "pectoralis_major", name: "Chest", role: "primary", atlasTargetId: "pectoralis.middle" },
    { slug: "triceps_brachii", name: "Triceps", role: "secondary", atlasTargetId: "triceps.lateral_head" },
    { slug: "serratus_anterior", name: "Serratus", role: "stabilizer", atlasTargetId: "serratus.anterior" },
  ],
  executionProfiles: [],
  bodyEffects: [],
  prescriptionSchema: {
    id: "33333333-3333-4333-8333-333333333333",
    key: "strength_sets_reps",
    version: "v1",
    checksum: "c".repeat(64),
    fields: [{ key: "sets", label: "Sets", type: "integer", required: true, min: 1, max: 20 }],
  },
  performedMetricSchema: {
    id: "44444444-4444-4444-8444-444444444444",
    key: "strength_performed",
    version: "v1",
    checksum: "d".repeat(64),
    fields: [{ key: "external_load_kg", label: "Load", type: "number", unit: "kg" }],
  },
  recordDefinitions: [{ id: "55555555-5555-4555-8555-555555555555", recordKey: "highest_load", key: "highest_load", comparisonDirection: "higher_better", canonicalUnit: "kg" }],
  heatMap: {
    policy: "required",
    mappingProfileId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    mappingSchemaVersion: "exercise_muscle_mapping_v2",
    mappingProfileVersion: 1,
    mappingChecksum: "a".repeat(64),
    taxonomy: { key: "main_muscle_intelligence", version: "advanced_visible_v1" },
    workloadModel: { key: "resistance_sets", version: "v1" },
    mapping: [{ muscleId: "pectoralis.middle", role: "primary", contribution: 1, sideScope: "bilateral", sortOrder: 1 }]
  },
  publicationPolicy: { id: "66666666-6666-4666-8666-666666666666", key: "public", version: 1, checksum: "e".repeat(64) },
  capabilityContract: { id: "77777777-7777-4777-8777-777777777777", version: "1", compatibleCatalogApiVersion: "v2", checksum: "f".repeat(64) },
  authority: {
    libraryRelease: { id: "88888888-8888-4888-8888-888888888888", version: "2026.08", checksum: "a".repeat(64) },
    catalogRelease: { id: "99999999-9999-4999-8999-999999999999", version: "2026.08", checksum: "b".repeat(64) },
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
  libraryRelease: { id: "88888888-8888-4888-8888-888888888888", version: "2026.08", checksum: "a".repeat(64), publishedAt: "2026-08-01", strengthSemanticFingerprint: "x" },
  catalogRelease: { id: "99999999-9999-4999-8999-999999999999", version: "2026.08", checksum: "b".repeat(64) },
};

describe("Exercise Detail canonical model", () => {
  it("preserves provider identity, requirements, role semantics, schemas and ordered instructions", () => {
    const model = catalogActivityDetailModel(activity, nativeMeta, "strength");
    expect(model.identity).toMatchObject({ activityId: activity.id, revisionId: activity.revisionId, source: "catalog_v2" });
    expect(model.identity.performance).toEqual({
      canonical: `provider:plaivra_activity_catalog:${activity.id}`,
      aliases: [`global:${activity.id}`],
      kind: "provider",
      activityId: activity.id,
    });
    expect(model.instructions.map((step) => step.order)).toEqual([1, 2]);
    expect(model.target).toMatchObject({
      kind: "muscle",
      primary: ["Chest"],
      secondary: ["Triceps"],
      stabilizer: ["Serratus"],
      anatomyAvailable: true,
    });
    expect(model.equipment).toEqual([
      { slug: "barbell", name: "Barbell", requirement: "required" },
      { slug: "bench", name: "Bench", requirement: "optional" },
    ]);
    expect(model.prescription?.version).toBe("v1");
    expect(model.prescription?.fields[0]).toMatchObject({ key: "sets", required: true, minimum: 1, maximum: 20 });
    expect(model.performedMetricSchema?.version).toBe("v1");
    expect(model.performedMetricSchema?.fields[0]?.key).toBe("external_load_kg");
    expect(model.recordDefinitions[0]?.recordKey).toBe("highest_load");
    expect(model.execution).toMatchObject({ executable: false, startHref: null, reason: "unsupported_execution_contract" });
    expect(model.catalogAuthoritySnapshot?.revisionId).toBe(activity.revisionId);
  });

  it("keeps Catalog prose locale-authoritative and localizes reviewed DE/AR semantic display values", () => {
    const deModel = catalogActivityDetailModel({
      ...activity,
      name: "Langhantel-Bankdrücken",
      shortDescription: "Kontrolliertes horizontales Drücken.",
      instructions: [{ order: 1, text: "Position einrichten." }, { order: 2, text: "Kontrolliert drücken." }],
    }, { ...nativeMeta, locale: "de" }, "strength");
    expect(deModel).toMatchObject({
      name: "Langhantel-Bankdrücken",
      shortDescription: "Kontrolliertes horizontales Drücken.",
      activityType: "Krafttraining",
      difficulty: "Fortgeschritten",
      movementPattern: "Horizontales Drücken",
      mechanics: "Mehrgelenkig",
      forceType: "Drücken",
    });
    expect(deModel.instructions.map((item) => item.text)).toEqual(["Position einrichten.", "Kontrolliert drücken."]);
    expect(deModel.equipment.map((item) => item.name)).toEqual(["Langhantel", "Bank"]);
    expect(deModel.target).toMatchObject({ primary: ["Brust"], secondary: ["Trizeps"], stabilizer: ["Sägemuskel"] });

    const arModel = catalogActivityDetailModel({
      ...activity,
      name: "ضغط صدر بالبار",
      shortDescription: "دفع أفقي بتحكم.",
      instructions: [{ order: 1, text: "اضبط وضع الجسم." }, { order: 2, text: "ادفع بتحكم." }],
    }, { ...nativeMeta, locale: "ar" }, "strength");
    expect(arModel).toMatchObject({
      name: "ضغط صدر بالبار",
      shortDescription: "دفع أفقي بتحكم.",
      activityType: "تمارين مقاومة",
      difficulty: "متوسط",
      movementPattern: "دفع أفقي",
      mechanics: "تمرين مركب",
      forceType: "دفع",
    });
    expect(arModel.instructions.map((item) => item.text)).toEqual(["اضبط وضع الجسم.", "ادفع بتحكم."]);
    expect(arModel.equipment.map((item) => item.name)).toEqual(["بار حديد", "مقعد"]);
    expect(arModel.target).toMatchObject({ primary: ["الصدر"], secondary: ["الترايسبس"], stabilizer: ["العضلة المنشارية"] });
  });

  it("bounds unknown DE/AR machine vocabulary instead of leaking raw values", () => {
    const model = catalogActivityDetailModel({
      ...activity,
      difficulty: "catalog_internal_level_7",
      movementPattern: "catalog_internal_motion",
      equipment: [{ slug: "catalog_machine_42", name: "Internal machine", requirement: "required" }],
      coverage: [{ slug: "catalog_muscle_42", name: "Internal muscle", role: "primary" }],
      heatMap: null,
    }, { ...nativeMeta, locale: "de" }, "strength");
    expect(model.difficulty).toBeNull();
    expect(model.movementPattern).toBeNull();
    expect(model.equipment).toEqual([]);
    expect(model.target.primary).toEqual([]);
  });

  it("blocks implementation and release prose at the shared six-route model boundary", () => {
    const model = catalogActivityDetailModel({
      ...activity,
      name: "P10E canonical identity",
      shortDescription: "Internal release provenance checksum 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      instructions: [
        { order: 1, text: "Perform the movement under control." },
        { order: 2, text: "Implementation schema phase label." },
      ],
    }, nativeMeta, "strength");

    expect(model.name).toBe("Exercise");
    expect(model.shortDescription).toBeNull();
    expect(model.instructions).toEqual([{ order: 1, text: "Perform the movement under control." }]);
    const visibleCopy = JSON.stringify({
      name: model.name,
      shortDescription: model.shortDescription,
      instructions: model.instructions,
      activityType: model.activityType,
      difficulty: model.difficulty,
      movementPattern: model.movementPattern,
      mechanics: model.mechanics,
      forceType: model.forceType,
      equipment: model.equipment,
      target: model.target,
    });
    expect(visibleCopy).not.toMatch(/P10E|canonical identity|provenance|checksum|implementation schema|0123456789abcdef/i);
  });

  it("restricts Start to the proven legacy Strength runtime", () => {
    const legacyMeta: LibraryProviderMeta = { ...nativeMeta, apiVersion: "v1-compat", source: "legacy", libraryRelease: null, catalogRelease: null };
    expect(catalogActivityDetailModel({ ...activity, authority: undefined }, legacyMeta, "strength").execution.startHref).toBe(`/workouts/session/${activity.id}`);
    const run = catalogActivityDetailModel({ ...activity, domain: "running", authority: undefined, coverage: [], heatMap: { policy: "not_applicable" } }, legacyMeta, "running");
    expect(run.target.kind).toBe("none");
    expect(run.execution.startHref).toBeNull();
  });

  it("materializes Add to Plan from immutable authority without prescription defaults", () => {
    const resolved = { core: catalogActivityDetailModel(activity, nativeMeta, "strength"), catalog: { detail: activity, meta: nativeMeta, domain: "strength" } };
    const payload = addToPlanActivityPayload(resolved);
    expect(payload.catalogSource).toBe("external");
    expect(payload.catalogAuthoritySnapshot?.activityId).toBe(activity.id);
    expect(payload.prescriptionSchema).toMatchObject({ key: "strength_sets_reps" });
    expect(JSON.stringify(payload)).not.toMatch(/8-12|"sets":3|rest_seconds.*75/);
  });

  it("keeps custom prose as prose and gives custom exercises stable performance identity", () => {
    const exercise: Workout = { id: "custom-exercise", name: "Saved Press", category: "Strength", target_muscle: "Chest", equipment: "Dumbbell", difficulty: "", sets: null, reps: null, rest_seconds: null, instructions: "Set the bench. Press with control.", notes: null, is_global: false };
    const model = customExerciseDetailModel(exercise, "en");
    expect(model.identity.performance.canonical).toBe("custom:custom-exercise");
    expect(model.instructions).toEqual([]);
    expect(model.instructionProse).toBe("Set the bench. Press with control.");
  });

  it("preserves frozen plan values and frozen provider provenance", () => {
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
      catalog_source: "external",
    };
    const model = planExerciseDetailModel({ exercise, planId: "plan", planName: "Plan", dayId: "day", dayName: "Day" });
    expect(model.prescription).toEqual([]);
    expect(model.instructions).toBe("Saved instruction");
    expect(model.note).toBe("Saved note");
    expect(model.performanceIdentity?.canonical).toBe(`provider:plaivra_activity_catalog:${activity.id}`);
    expect(model.canonicalHref).toBe(`/workouts/${activity.id}`);
  });
});
