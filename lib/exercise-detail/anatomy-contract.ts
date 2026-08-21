import type { LibraryHeatMap, LibraryRequiredHeatMap } from "@/lib/activity-catalog/library-types";
import {
  ADVANCED_MUSCLE_ATLAS_VERSION,
  ADVANCED_MUSCLE_MAPPING_SCHEMA_VERSION,
} from "@/lib/train/muscle-intelligence/versions";

export const EXERCISE_DETAIL_TAXONOMY_KEY = "main_muscle_intelligence" as const;

export function isCompatibleExerciseHeatMap(heatMap: LibraryHeatMap | null | undefined): heatMap is LibraryRequiredHeatMap {
  return heatMap?.policy === "required"
    && heatMap.taxonomy.key === EXERCISE_DETAIL_TAXONOMY_KEY
    && heatMap.taxonomy.version === ADVANCED_MUSCLE_ATLAS_VERSION
    && heatMap.mappingSchemaVersion === ADVANCED_MUSCLE_MAPPING_SCHEMA_VERSION;
}
