import type { FoodCatalogSourceAdapter } from "./adapter";
import type {
  FoodCatalogCandidateInput,
  FoodCatalogSourceDescriptor
} from "./contracts";

export type SyntheticFoodCatalogArtifact = {
  source: FoodCatalogSourceDescriptor;
  candidates: readonly FoodCatalogCandidateInput[];
};

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

/**
 * Reference-only adapter used by Plan 4 tests and architecture verification.
 * It intentionally contains no real provider assumptions.
 */
export function createSyntheticFoodCatalogAdapter<
  TArtifact extends SyntheticFoodCatalogArtifact = SyntheticFoodCatalogArtifact
>(): FoodCatalogSourceAdapter<TArtifact> {
  return {
    adapterId: "synthetic-reference",
    adapterVersion: "1",
    describeSource: (artifact) => cloneValue(artifact.source),
    toCandidates: (artifact) => cloneValue(artifact.candidates)
  };
}
