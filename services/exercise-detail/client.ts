"use client";

import type { LibraryActivityDetail, LibraryAlternative, LibraryProviderMeta } from "@/lib/activity-catalog/library-types";
import { catalogActivityDetailModel, customExerciseDetailModel } from "@/lib/exercise-detail/model";
import type { AddToPlanActivityPayload, ExerciseDetailViewModel } from "@/lib/exercise-detail/contracts";
import { supabase } from "@/lib/supabase/client";
import {
  getLibraryDomainActivity,
  getLibraryDomainActivityAlternatives,
  listLibraryDomains
} from "@/services/activity-catalog/client";
import { getUserWorkoutPlans } from "@/services/database/workout-plans";
import { getCustomExercisesWithStatus } from "@/services/workouts/exercise-library-store";
import { getUserExerciseVideo } from "@/services/database/workout-library";
import type { UserWorkoutPlan } from "@/types";

export type ResolvedExerciseDetail = {
  core: ExerciseDetailViewModel;
  catalog: { detail: LibraryActivityDetail; meta: LibraryProviderMeta; domain: string } | null;
  initialCustomVideoUrl: string | null;
};

export async function resolveExerciseDetail(identifier: string, userId: string | undefined, locale: string): Promise<ResolvedExerciseDetail> {
  const customResult = await getCustomExercisesWithStatus(userId);
  const custom = customResult.data.find((item) => item.id === identifier);
  if (custom) return { core: customExerciseDetailModel(custom, locale), catalog: null, initialCustomVideoUrl: custom.custom_video_url ?? null };

  const domainsResult = await listLibraryDomains(locale);
  const domains = Array.from(new Set(["strength", ...domainsResult.data.map((domain) => domain.key)]));
  let lastError: unknown = null;
  for (const domain of domains) {
    try {
      const result = await getLibraryDomainActivity(domain, identifier, locale);
      const customVideo = userId ? await getUserExerciseVideo(userId, result.data.id).catch(() => null) : null;
      return { core: catalogActivityDetailModel(result.data, result.meta, domain), catalog: { detail: result.data, meta: result.meta, domain }, initialCustomVideoUrl: customVideo?.custom_video_url ?? null };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("Exercise not found.");
}

export async function loadExerciseAlternatives(resolved: ResolvedExerciseDetail, locale: string) {
  if (!resolved.catalog) return [] as LibraryAlternative[];
  return (await getLibraryDomainActivityAlternatives(
    resolved.catalog.domain,
    resolved.catalog.detail.id,
    { limit: 10, locale }
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
