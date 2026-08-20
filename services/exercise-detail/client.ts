"use client";

import type { CatalogLocale } from "@/lib/activity-catalog/catalog-locale";
import type { LibraryActivityDetail, LibraryAlternative, LibraryProviderMeta } from "@/lib/activity-catalog/library-types";
import { catalogActivityDetailModel, customExerciseDetailModel } from "@/lib/exercise-detail/model";
import type { AddToPlanActivityPayload, ExerciseDetailViewModel } from "@/lib/exercise-detail/contracts";
import { supabase } from "@/lib/supabase/client";
import {
  getLibraryActivity,
  getLibraryDomainActivityAlternatives
} from "@/services/activity-catalog/client";
import { getUserWorkoutPlans } from "@/services/database/workout-plans";
import { getOwnedCustomExerciseDirect } from "./custom-exercise";
import type { UserWorkoutPlan } from "@/types";

export type ResolvedExerciseDetail = {
  core: ExerciseDetailViewModel;
  catalog: { detail: LibraryActivityDetail; meta: LibraryProviderMeta; domain: string } | null;
};

export async function resolveExerciseDetail(
  identifier: string,
  userId: string | undefined,
  intlLocale: string,
  catalogLocale: CatalogLocale,
  signal?: AbortSignal
): Promise<ResolvedExerciseDetail> {
  const custom = await getOwnedCustomExerciseDirect(userId, identifier, signal);
  if (custom) return { core: customExerciseDetailModel(custom, intlLocale), catalog: null };

  const result = await getLibraryActivity(identifier, catalogLocale, { signal });
  const domain = result.data.domain;
  if (!domain) throw new Error("The exercise catalog returned detail without a canonical domain.");
  return {
    core: catalogActivityDetailModel(result.data, result.meta, domain),
    catalog: { detail: result.data, meta: result.meta, domain }
  };
}

export async function loadExerciseAlternatives(
  resolved: ResolvedExerciseDetail,
  catalogLocale: CatalogLocale,
  signal?: AbortSignal
) {
  if (!resolved.catalog) return [] as LibraryAlternative[];
  return (await getLibraryDomainActivityAlternatives(
    resolved.catalog.domain,
    resolved.catalog.detail.id,
    { limit: 10, locale: catalogLocale },
    { signal }
  )).data;
}

export async function loadExercisePlans(userId: string): Promise<UserWorkoutPlan[]> {
  return getUserWorkoutPlans(userId);
}

export async function addExerciseToPlanDay(dayId: string, activity: AddToPlanActivityPayload, prescription: Record<string, unknown>) {
  if (!supabase) throw new Error("A database connection is required.");
  const { data, error } = await supabase.rpc("add_catalog_activity_to_plan_day_atomic", {
    p_plan_day_id: dayId,
    p_activity: activity,
    p_planned_prescription: prescription
  });
  if (error) throw new Error(error.message);
  return data as { status: "added" | "duplicate"; plan_day_id: string; plan_exercise_id?: string };
}
