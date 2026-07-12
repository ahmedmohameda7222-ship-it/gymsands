"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeading } from "@/components/layout/page-heading";
import { CardSkeleton } from "@/components/ui/state-views";
import { NutritionTargetSettings } from "@/components/meals/nutrition-target-settings";
import { parseEatDate } from "@/lib/eat/eat-model";
import { useEatTranslation } from "@/lib/i18n/eat";
import { useTodayDate } from "@/lib/hooks/use-today-date";

export default function NutritionTargetsPage() {
  return <Suspense fallback={<CardSkeleton rows={5} />}><NutritionTargetsContent /></Suspense>;
}

function NutritionTargetsContent() {
  const params = useSearchParams();
  const today = useTodayDate();
  const { et } = useEatTranslation();
  const selectedDate = parseEatDate(params.get("date"), today);
  const returnHref = safeReturnHref(params.get("return"), `/calories?date=${selectedDate}&view=day`);
  return <div className="space-y-4"><PageHeading title={et("settingsTitle")} description={et("settingsDesc")} /><NutritionTargetSettings selectedDate={selectedDate} returnHref={returnHref} /></div>;
}

export function safeReturnHref(value: string | null | undefined, fallback: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  return value;
}
