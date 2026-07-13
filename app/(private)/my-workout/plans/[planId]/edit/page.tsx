"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { WorkoutPlanEditor } from "@/components/workouts/workout-plan-editor";
import { ErrorState } from "@/components/ui/state-views";
import { useTrainTranslation } from "@/lib/i18n/train";
import { archivedPlanEditorRedirect } from "@/lib/workouts/train-overview-runtime";
import { getWorkoutPlanById } from "@/services/database/workout-plan-loader";

export default function WorkoutPlanEditorPage() {
  const params = useParams<{ planId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { tr } = useTrainTranslation();
  const [state, setState] = useState<"loading" | "allowed" | "blocked" | "failed">("loading");

  useEffect(() => {
    let current = true;
    async function verifyPlan() {
      if (!user?.id) return;
      setState("loading");
      try {
        const plan = await getWorkoutPlanById(user.id, params.planId);
        if (!current) return;
        if (!plan) {
          setState("failed");
          return;
        }
        const redirect = archivedPlanEditorRedirect(plan);
        if (redirect) {
          setState("blocked");
          router.replace(redirect);
          return;
        }
        setState("allowed");
      } catch {
        if (current) setState("failed");
      }
    }
    void verifyPlan();
    return () => { current = false; };
  }, [params.planId, router, user?.id]);

  if (state === "loading" || state === "blocked") {
    return <div className="space-y-4" aria-busy="true"><div className="h-9 w-64 animate-pulse rounded-lg bg-muted" /><div className="h-96 animate-pulse rounded-2xl bg-muted" /></div>;
  }
  if (state === "failed") {
    return <ErrorState title={tr("editorUnavailable")} description={tr("editorLoadFallback")} fallbackHref="/my-workout/plans" fallbackLabel={tr("backToTrain")} />;
  }
  return <WorkoutPlanEditor />;
}
