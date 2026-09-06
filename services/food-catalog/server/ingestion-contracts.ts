import "server-only";

import type { FoodCatalogDryRunManifestContent } from "@/lib/food-catalog/ingestion/contracts";

export type ExecuteApprovedFoodCatalogDraftMutationInput = {
  manifestContent: FoodCatalogDryRunManifestContent;
  manifestContentChecksumSha256: string;
  semanticIdentityChecksumSha256: string;
  attemptNumber: number;
  leaseOwner: string;
  leaseSeconds: number;
  operationNamespace: string;
};

export type ExecuteApprovedFoodCatalogDraftMutationResult = {
  batchId: string;
  runId: string;
  status: string;
  reconciliationId: string | null;
};
