import type { NutritionTargetProfileType, UserNutritionTargetProfile } from "@/types/database";

export type NutritionTargetAssignment = NutritionTargetProfileType | "auto";

export type UserNutritionTargetDateOverride = {
  id: string;
  user_id: string;
  target_date: string;
  target_type: NutritionTargetProfileType;
  created_at: string;
  updated_at: string;
};

export type NutritionTargetApplyResult = {
  assignment: NutritionTargetAssignment;
  profile: UserNutritionTargetProfile;
  override: UserNutritionTargetDateOverride | null;
};
