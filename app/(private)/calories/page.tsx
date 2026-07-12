"use client";

import { Suspense } from "react";
import { EatPage } from "@/components/meals/eat-page";
import { CardSkeleton } from "@/components/ui/state-views";

export default function CaloriesPage() {
  return <Suspense fallback={<EatPageFallback />}><EatPage /></Suspense>;
}

function EatPageFallback() {
  return <div className="space-y-4 pb-28 lg:pb-8"><CardSkeleton rows={3} /><CardSkeleton rows={4} /><CardSkeleton rows={6} /></div>;
}
