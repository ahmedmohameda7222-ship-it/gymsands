"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { PlanMuscleLoadPanel } from "@/components/workouts/plan-muscle-load-panel";
import { TrainPageContainer } from "@/components/workouts/train-ui";
import { useTrainTranslation } from "@/lib/i18n/train";
import { getWorkoutPlanById } from "@/services/database/workout-plan-loader";
import type { UserWorkoutPlan } from "@/types";

export function WorkoutPlanWeeklyMuscleLoad() {
  const params = useParams<{ planId: string }>();
  const { user } = useAuth();
  const { language, dir } = useTrainTranslation();
  const [plan, setPlan] = useState<UserWorkoutPlan | null>(null);

  useEffect(() => {
    let current = true;
    if (!user?.id) return;
    void getWorkoutPlanById(user.id, params.planId)
      .then((value) => {
        if (current) setPlan(value);
      })
      .catch(() => {
        if (current) setPlan(null);
      });
    return () => {
      current = false;
    };
  }, [params.planId, user?.id]);

  if (!plan) return null;

  return (
    <TrainPageContainer className="pt-0" dir={dir} data-phase4b-plan-details-analysis>
      <PlanMuscleLoadPanel
        days={plan.days}
        defaultScope="entire_plan"
        variant="details"
        language={language}
      />
    </TrainPageContainer>
  );
}
