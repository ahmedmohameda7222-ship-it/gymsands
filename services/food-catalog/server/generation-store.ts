import "server-only";

import type { FoodVerificationScope } from "@/lib/food-catalog/domain/verification";
import type {
  CreateActivationSetCommand,
  CreateGenerationCommand,
  GenerationCommandResult,
  GrantActivationSetCommand,
  InvalidateActivationGrantCommand,
  PromoteGenerationCommand,
  RecordGenerationValidationCommand,
  RevokeGenerationCommand,
  RollbackGenerationCommand,
  StoredActivationAuthority,
  StoredCatalogGeneration,
  StoredCurrentGenerationPointer,
  StoredGenerationEvent,
  StoredGenerationFood,
  StoredGenerationRedirect,
  StoredGenerationSelections,
  StoredGenerationValidationFinding,
  StoredGenerationValidationReport,
} from "./generation-contracts";
import type {
  StoredFoodMarketAssignment,
  StoredFoodNameFact,
  StoredFoodNutritionRevision,
  StoredFoodServingOption,
  StoredFoodTaxonomyAssignment,
  StoredFoodVerificationAssertion,
} from "./contracts";

export interface FoodCatalogGenerationReadStore {
  readCurrentPointer(): Promise<StoredCurrentGenerationPointer>;
  readGeneration(generationId: string): Promise<StoredCatalogGeneration | null>;
  readGenerationFoods(generationId: string): Promise<StoredGenerationFood[]>;
  readGenerationFood(generationId: string, foodId: string): Promise<StoredGenerationFood | null>;
  readGenerationRedirects(generationId: string): Promise<StoredGenerationRedirect[]>;
  readGenerationRedirect(generationId: string, sourceFoodId: string): Promise<StoredGenerationRedirect | null>;
  readGenerationSelections(generationId: string, foodId: string): Promise<StoredGenerationSelections>;
  readNutritionRevision(foodId: string, revisionId: string): Promise<StoredFoodNutritionRevision | null>;
  readServingOptions(foodId: string, ids: readonly string[]): Promise<StoredFoodServingOption[]>;
  readNames(foodId: string, ids: readonly string[]): Promise<StoredFoodNameFact[]>;
  readTaxonomyAssignments(foodId: string, ids: readonly string[]): Promise<StoredFoodTaxonomyAssignment[]>;
  readMarketAssignments(foodId: string, ids: readonly string[]): Promise<StoredFoodMarketAssignment[]>;
  readVerificationAssertions(
    foodId: string,
    selections: ReadonlyArray<{ scope: FoodVerificationScope; assertionId: string }>,
  ): Promise<StoredFoodVerificationAssertion[]>;
  readActivationAuthority(memberId: string, grantEventId: string): Promise<StoredActivationAuthority | null>;
  readGenerationEvent(eventId: string): Promise<StoredGenerationEvent | null>;
  readValidationReport(reportId: string): Promise<StoredGenerationValidationReport | null>;
  readValidationFindings(reportId: string): Promise<StoredGenerationValidationFinding[]>;
}

export interface FoodCatalogGenerationCommandStore {
  createActivationSet(command: CreateActivationSetCommand): Promise<GenerationCommandResult>;
  grantActivationSet(command: GrantActivationSetCommand): Promise<GenerationCommandResult>;
  invalidateActivationGrant(command: InvalidateActivationGrantCommand): Promise<GenerationCommandResult>;
  createGeneration(command: CreateGenerationCommand): Promise<GenerationCommandResult>;
  recordValidation(command: RecordGenerationValidationCommand): Promise<GenerationCommandResult>;
  promoteGeneration(command: PromoteGenerationCommand): Promise<GenerationCommandResult>;
  rollbackGeneration(command: RollbackGenerationCommand): Promise<GenerationCommandResult>;
  revokeGeneration(command: RevokeGenerationCommand): Promise<GenerationCommandResult>;
}
