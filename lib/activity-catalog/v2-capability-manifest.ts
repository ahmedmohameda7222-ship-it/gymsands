import {
  DORMANT_LONGEST_DISTANCE_FORMULA,
  DORMANT_LONGEST_DURATION_FORMULA,
  DURATION_EXPOSURE_MODEL
} from "./dormant-runtime-capabilities";

export const MAIN_ACTIVITY_CATALOG_V2_CAPABILITY_V2 = Object.freeze({
  contractVersion: "main-activity-catalog-v2-capability-v2",
  sourceMainSha: "0a4c902a560542812de72cbc08dc90fe3fb7d147",
  compatibleCatalogApiVersion: "v2" as const,
  supportedWorkloadModels: [
    {
      modelKey: "resistance_sets",
      modelVersion: "v1",
      mainRuntimeConstant: "resistance_sets_v1",
      engineVersion: "muscle_load_resistance_sets_v2"
    },
    DURATION_EXPOSURE_MODEL
  ] as const,
  supportedPrFormulas: [
    { formulaKey: "highest_load", formulaVersion: "wh6-v1" },
    { formulaKey: "estimated_one_rep_max", formulaVersion: "wh6-v1" },
    { formulaKey: "exercise_session_volume", formulaVersion: "wh6-v1" },
    { formulaKey: "same_load_max_repetitions", formulaVersion: "wh6-v1" },
    { formulaKey: DORMANT_LONGEST_DURATION_FORMULA.formulaKey, formulaVersion: DORMANT_LONGEST_DURATION_FORMULA.formulaVersion },
    { formulaKey: DORMANT_LONGEST_DISTANCE_FORMULA.formulaKey, formulaVersion: DORMANT_LONGEST_DISTANCE_FORMULA.formulaVersion }
  ] as const
});
