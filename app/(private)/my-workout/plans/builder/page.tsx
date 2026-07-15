"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { WorkoutPlanBuilder } from "@/components/workouts/workout-plan-builder";
import { TrainPageContainer } from "@/components/workouts/train-ui";
import { useRouter } from "next/navigation";
import { useTrainTranslation } from "@/lib/i18n/train";

export default function BuilderPage() {
  const router = useRouter();
  const { dir, tr } = useTrainTranslation();

  return (
    <TrainPageContainer className="max-w-[1120px] space-y-6" dir={dir}>
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" className="min-h-11 px-2">
          <Link href="/my-workout/plans"><ArrowLeft className="h-4 w-4 rtl:rotate-180" />{tr("backToTrain")}</Link>
        </Button>
      </div>
      <PageHeading
        title={tr("builderTitle")}
        description={tr("builderDescription")}
      />
      <WorkoutPlanBuilder loadActivePlan={false} onSaved={() => router.push("/my-workout/plans")} />
    </TrainPageContainer>
  );
}
