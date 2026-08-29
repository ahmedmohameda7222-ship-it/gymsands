"use client";

import { Suspense } from "react";

import { DiaryPage } from "@/components/nutrition/diary/diary-page";
import { AddToHandoffConsumer } from "@/components/nutrition/handoffs/add-to-handoff-consumer";
import { SavedMealUtilityLauncher } from "@/components/nutrition/saved-meals/saved-meal-utility-launcher";
import { CardSkeleton } from "@/components/ui/state-views";

export default function CaloriesPage() {
  return <Suspense fallback={<DiaryPageFallback />}><SavedMealUtilityLauncher /><DiaryPage /><AddToHandoffConsumer destination="diary" /><AddToHandoffConsumer destination="saved_meal" /></Suspense>;
}

function DiaryPageFallback() {
  return <div className="space-y-4 pb-28 lg:pb-8"><CardSkeleton rows={3} /><CardSkeleton rows={4} /><CardSkeleton rows={6} /></div>;
}
