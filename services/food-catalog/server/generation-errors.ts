import "server-only";

export type FoodCatalogGenerationErrorCode =
  | "NO_CURRENT_GENERATION"
  | "GENERATION_NOT_FOUND"
  | "GENERATION_CHECKSUM_MISMATCH"
  | "GENERATION_NOT_SEALED"
  | "VALIDATION_REPORT_MISMATCH"
  | "BLOCKING_FINDINGS"
  | "STALE_CURRENT_GENERATION"
  | "INVALID_ACTIVATION_GRANT"
  | "CROSS_FOOD_SELECTION"
  | "INVALID_VERIFICATION_SELECTION"
  | "INVALID_REDIRECT"
  | "OPERATION_ID_CONFLICT"
  | "CONTROL_PLANE_REJECTED";

export class FoodCatalogGenerationError extends Error {
  constructor(
    public readonly code: FoodCatalogGenerationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "FoodCatalogGenerationError";
  }
}
