"use client";

import { Suspense } from "react";

import { DiaryPage } from "@/components/nutrition/diary/diary-page";
import { CardSkeleton } from "@/components/ui/state-views";

export default function CaloriesPage() {
  return <Suspense fallback={<DiaryPageFallback />}><DiaryPage /></Suspense>;
}

function DiaryPageFallback() {
  return <div className="space-y-4 pb-28 lg:pb-8"><CardSkeleton rows={3} /><CardSkeleton rows={4} /><CardSkeleton rows={6} /></div>;
}
