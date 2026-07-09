"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PageHeading } from "@/components/layout/page-heading";
import { FoodBrowser } from "@/components/meals/food-browser";
import { CustomNutritionManager } from "@/components/meals/custom-nutrition-manager";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { CardSkeleton } from "@/components/ui/state-views";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useTodayDate } from "@/lib/hooks/use-today-date";

export default function FoodHubPage() {
  return (
    <Suspense fallback={<FoodHubFallback />}>
      <FoodHubContent />
    </Suspense>
  );
}

function FoodHubContent() {
  const today = useTodayDate();
  const searchParams = useSearchParams();
  const builderParam = searchParams.get("builder");
  const [showBuilder, setShowBuilder] = useState(builderParam === "1");
  const [builderDirty, setBuilderDirty] = useState(false);
  const { dialog: confirmDialog, ask: confirmAsk } = useConfirm();

  useEffect(() => {
    if (builderParam === "1") setShowBuilder(true);
  }, [builderParam]);

  function toggleBuilder() {
    if (showBuilder && builderDirty) {
      confirmAsk({
        title: "Discard custom nutrition draft?",
        description: "Your unsaved custom food or saved meal changes will stay on screen unless you discard them.",
        confirmLabel: "Discard and close",
        cancelLabel: "Keep editing",
        variant: "destructive",
        onConfirm: () => {
          setBuilderDirty(false);
          setShowBuilder(false);
        }
      });
      return;
    }
    setShowBuilder((current) => !current);
  }

  return (
    <div className="space-y-4">
      {confirmDialog}
      <PageHeading
        title="Food Hub"
        description="Use this hub for custom foods, saved meals, and manual corrections after AI/import review or when you need precise control."
      />
      <Surface variant="glass" className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <p className="text-sm font-semibold text-foreground">Manual fallback and correction tools</p>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            For normal meal logging, start with ChatGPT/photo import on Calories, review the estimate, then save. Food Hub is for corrections, reusable foods, saved meals, and power-user manual logging.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button asChild className="min-h-12">
            <Link href="/calories">Back to AI-first Calories</Link>
          </Button>
          <Button type="button" variant="outline" className="min-h-12" onClick={toggleBuilder}>
            {showBuilder ? "Close Builder" : "Create / Edit Custom Foods & Meals"}
          </Button>
        </div>
      </Surface>
      {showBuilder ? <CustomNutritionManager selectedDate={today} onDirtyChange={setBuilderDirty} /> : null}
      <FoodBrowser initialLogs={[]} logDate={today} />
    </div>
  );
}

function FoodHubFallback() {
  return (
    <div className="space-y-4">
      <PageHeading
        title="Food Hub"
        description="Manual fallback tools for custom foods, saved meals, and nutrition corrections."
      />
      <CardSkeleton rows={4} />
      <CardSkeleton rows={3} />
    </div>
  );
}
