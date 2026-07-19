"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { CardSkeleton, EmptyState, ErrorState } from "@/components/ui/state-views";
import { PlanMuscleLoadPanel } from "@/components/workouts/plan-muscle-load-panel";
import { TrainPageContainer } from "@/components/workouts/train-ui";
import { userSafeError } from "@/lib/error-formatting";
import { useTrainTranslation } from "@/lib/i18n/train";
import { getMuscleLoadVisibilityCopy } from "@/lib/train/muscle-intelligence/muscle-load-visibility-copy";
import { getAllUserWorkoutPlans } from "@/services/database/workout-plan-loader";
import type { UserWorkoutPlan } from "@/types";

export function TrainMuscleLoadOverview() {
  const { user } = useAuth();
  const { language, dir } = useTrainTranslation();
  const text = getMuscleLoadVisibilityCopy(language);
  const userId = user?.id;
  const loadFailedDescription = text.loadFailedDescription;
  const [plans, setPlans] = useState<UserWorkoutPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!userId) {
      setPlans([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      setPlans(await getAllUserWorkoutPlans(userId));
    } catch (reason) {
      setPlans([]);
      setError(userSafeError(reason, loadFailedDescription));
    } finally {
      setLoading(false);
    }
  }, [loadFailedDescription, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const activePlan = useMemo(() => {
    const available = plans.filter((plan) => !plan.archived_at);
    return available.find((plan) => plan.is_active) ?? available.find((plan) => plan.is_default) ?? null;
  }, [plans]);

  return (
    <TrainPageContainer className="space-y-6" dir={dir} data-muscle-load-overview>
      <Button asChild variant="outline" size="sm">
        <Link href="/my-workout/plans"><ArrowLeft className="h-4 w-4 rtl:rotate-180" />{text.backToTrain}</Link>
      </Button>

      <PageHeading title={text.pageTitle} description={text.pageDescription} />

      {loading ? <CardSkeleton rows={6} /> : null}
      {!loading && error ? (
        <ErrorState
          title={text.loadFailedTitle}
          description={error}
          onRetry={load}
          fallbackLabel={text.viewPlans}
          fallbackHref="/my-workout/plans"
        />
      ) : null}
      {!loading && !error && !activePlan ? (
        <EmptyState
          title={text.noPlanTitle}
          description={text.noPlanDescription}
          actionLabel={text.viewPlans}
          actionHref="/my-workout/plans"
        />
      ) : null}
      {!loading && !error && activePlan ? (
        <PlanMuscleLoadPanel
          days={activePlan.days}
          defaultScope="entire_plan"
          variant="review"
          language={language}
          titleOverride={text.panelTitle}
          descriptionOverride={text.panelDescription}
          showScopeControl={false}
        />
      ) : null}
    </TrainPageContainer>
  );
}
