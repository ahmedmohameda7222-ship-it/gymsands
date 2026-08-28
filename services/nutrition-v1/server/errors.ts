import { nutritionJson } from "@/lib/nutrition-v1/http";
import { RecipeDraftRevisionConflictError } from "@/services/nutrition-v1/server/recipes";

const DEFAULT_INVALID_MESSAGE = "Nutrition request is invalid.";
const MAX_PUBLIC_ERROR_LENGTH = 160;

type NutritionRequestStatus = 400 | 404;

function boundedPublicMessage(message: string) {
  const clean = message.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
  return (clean || DEFAULT_INVALID_MESSAGE).slice(0, MAX_PUBLIC_ERROR_LENGTH);
}

export class NutritionRequestError extends Error {
  readonly code = "nutrition_request_invalid" as const;
  readonly status: NutritionRequestStatus;
  readonly publicMessage: string;

  constructor(message = DEFAULT_INVALID_MESSAGE, status: NutritionRequestStatus = 400) {
    const publicMessage = boundedPublicMessage(message);
    super(publicMessage);
    this.name = "NutritionRequestError";
    this.status = status;
    this.publicMessage = publicMessage;
  }
}

export function nutritionErrorResponse(error: unknown) {
  if (error instanceof NutritionRequestError) {
    return nutritionJson(
      { error: error.publicMessage, code: error.code },
      { status: error.status },
    );
  }

  if (error instanceof RecipeDraftRevisionConflictError) {
    return nutritionJson(
      { error: boundedPublicMessage(error.message), code: error.code },
      { status: error.status },
    );
  }

  return nutritionJson(
    {
      error: "Nutrition request could not be completed.",
      code: "nutrition_unavailable",
    },
    { status: 500 },
  );
}
