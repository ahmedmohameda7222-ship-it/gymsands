import type {
  FoodCatalogCandidateInput,
  FoodCatalogSourceDescriptor
} from "./contracts";

/**
 * Provider-neutral pure adapter boundary. Adapters translate exact source
 * artifacts into structured evidence only; persistence and catalog authority
 * deliberately live outside this contract.
 */
export interface FoodCatalogSourceAdapter<TArtifact> {
  readonly adapterId: string;
  readonly adapterVersion: string;
  describeSource(artifact: TArtifact): FoodCatalogSourceDescriptor;
  toCandidates(artifact: TArtifact): readonly FoodCatalogCandidateInput[];
}
