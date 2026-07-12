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
import { parseEatDate, normalizeEditableMealType } from "@/lib/eat/eat-model";
import { useTodayDate } from "@/lib/hooks/use-today-date";

export default function FoodHubPage() {
  return <Suspense fallback={<FoodHubFallback />}><FoodHubContent /></Suspense>;
}

function FoodHubContent() {
  const today = useTodayDate();
  const searchParams = useSearchParams();
  const selectedDate = parseEatDate(searchParams.get("date"), today);
  const selectedMeal = normalizeEditableMealType(searchParams.get("meal"), "Lunch");
  const returnHref = safeReturnHref(searchParams.get("return"), `/calories?date=${selectedDate}&view=day`);
  const builderParam = searchParams.get("builder");
  const [showBuilder, setShowBuilder] = useState(builderParam === "1");
  const [builderDirty, setBuilderDirty] = useState(false);
  const { dialog: confirmDialog, ask: confirmAsk } = useConfirm();

  useEffect(() => { if (builderParam === "1") setShowBuilder(true); }, [builderParam]);

  function toggleBuilder() {
    if (showBuilder && builderDirty) {
      confirmAsk({ title: "Discard custom nutrition draft?", description: "Your unsaved custom food or saved meal changes will stay on screen unless you discard them.", confirmLabel: "Discard and close", cancelLabel: "Keep editing", variant: "destructive", onConfirm: () => { setBuilderDirty(false); setShowBuilder(false); } });
      return;
    }
    setShowBuilder((current) => !current);
  }

  return <div className="space-y-4">
    {confirmDialog}
    <PageHeading title="Food Builder" description={`Create or edit reusable foods and meals for ${selectedDate}. Logging destination: ${selectedMeal}.`} />
    <Surface variant="glass" className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[1fr_auto] lg:items-center">
      <div><p className="text-sm font-semibold text-foreground">Reusable food and meal administration</p><p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">Normal logging stays in Eat. This route protects larger custom-food and saved-meal drafts.</p></div>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap"><Button asChild className="min-h-12"><Link href={returnHref}>Back to Eat</Link></Button><Button type="button" variant="outline" className="min-h-12" onClick={toggleBuilder}>{showBuilder ? "Close Builder" : "Create / Edit Custom Foods & Meals"}</Button></div>
    </Surface>
    {showBuilder ? <CustomNutritionManager selectedDate={selectedDate} onDirtyChange={setBuilderDirty} /> : null}
    <FoodBrowser initialLogs={[]} logDate={selectedDate} defaultMealType={selectedMeal} />
  </div>;
}

function safeReturnHref(value: string | null, fallback: string) { return value && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : fallback; }
function FoodHubFallback() { return <div className="space-y-4"><PageHeading title="Food Builder" description="Custom foods and saved meals." /><CardSkeleton rows={4} /><CardSkeleton rows={3} /></div>; }
