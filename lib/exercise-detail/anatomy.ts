import type { ExerciseDetailViewModel, ExerciseTargetRole } from "./contracts";
import { isAdvancedMuscleTargetId, type AdvancedMuscleTargetId } from "@/lib/train/muscle-intelligence/advanced-atlas";
import type { AdvancedHeatLevel } from "@/lib/train/muscle-intelligence/advanced-exposure";

export type ExerciseMusclePreviewTarget = {
  targetId: AdvancedMuscleTargetId;
  role: Extract<ExerciseTargetRole, "primary" | "secondary" | "stabilizer">;
  heatLevel: AdvancedHeatLevel;
};

export type ExerciseMusclePreview = {
  kind: "exercise_authority_preview";
  targets: ExerciseMusclePreviewTarget[];
};

const ROLE_HEAT: Record<ExerciseMusclePreviewTarget["role"], AdvancedHeatLevel> = {
  primary: "high",
  secondary: "moderate",
  stabilizer: "light"
};

export function projectAuthoritativeExercisePreview(exercise: ExerciseDetailViewModel): ExerciseMusclePreview | null {
  if (exercise.identity.source !== "catalog_v2") return null;
  const targets = new Map<AdvancedMuscleTargetId, ExerciseMusclePreviewTarget>();
  const add = (candidate: unknown, role: unknown) => {
    if (!isAdvancedMuscleTargetId(candidate) || (role !== "primary" && role !== "secondary" && role !== "stabilizer")) return;
    const next: ExerciseMusclePreviewTarget = { targetId: candidate, role, heatLevel: ROLE_HEAT[role] };
    const current = targets.get(candidate);
    const rank = { light: 1, moderate: 2, high: 3, none: 0 } as const;
    if (!current || rank[next.heatLevel] > rank[current.heatLevel]) targets.set(candidate, next);
  };
  for (const item of exercise.anatomyAuthority.coverage) add(item.atlasTargetId ?? item.targetId, item.role);
  for (const item of exercise.anatomyAuthority.heatMap?.mapping ?? []) add(item.atlasTargetId ?? item.targetId, item.role);
  return targets.size ? { kind: "exercise_authority_preview", targets: [...targets.values()] } : null;
}
