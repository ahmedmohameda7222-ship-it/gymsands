"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PageHeading } from "@/components/layout/page-heading";
import { NutritionTargetSettings } from "@/components/meals/nutrition-target-settings";
import { CardSkeleton } from "@/components/ui/state-views";
import { parseEatDate } from "@/lib/eat/eat-model";
import { useTodayDate } from "@/lib/hooks/use-today-date";
import { useNutritionTargetsTranslation } from "@/lib/i18n/nutrition-targets";

export default function NutritionTargetsPage() {
  return <Suspense fallback={<CardSkeleton rows={5} />}><NutritionTargetsContent /></Suspense>;
}

function NutritionTargetsContent() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const today = useTodayDate();
  const { nt, dir } = useNutritionTargetsTranslation();
  const rawDate = params.get("date");
  const selectedDate = parseEatDate(rawDate, today);
  const fallbackReturn = `/calories?date=${selectedDate}&view=day`;
  const returnHref = safeReturnHref(params.get("return"), fallbackReturn);

  useEffect(() => {
    if (rawDate === selectedDate) return;
    const next = new URLSearchParams(params.toString());
    next.set("date", selectedDate);
    if (returnHref !== fallbackReturn) next.set("return", returnHref);
    else next.delete("return");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [fallbackReturn, params, pathname, rawDate, returnHref, router, selectedDate]);

  return <div className="space-y-4" dir={dir}>
    <PageHeading title={nt("title")} description={nt("description")} />
    <NutritionTargetSettings selectedDate={selectedDate} returnHref={returnHref} />
  </div>;
}

export function safeReturnHref(value: string | null | undefined, fallback: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  return value;
}
