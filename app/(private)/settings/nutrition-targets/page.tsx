"use client";

import { Suspense, useEffect, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PageHeading } from "@/components/layout/page-heading";
import { NutritionTargetSettings } from "@/components/meals/nutrition-target-settings";
import { CardSkeleton } from "@/components/ui/state-views";
import { parseEatDate } from "@/lib/eat/eat-model";
import {
  parseNutritionTargetsReturnDestination,
  resolveNutritionTargetsReturnHref,
  safeCustomNutritionTargetsReturnHref
} from "@/lib/eat/nutrition-target-return";
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
  const rawReturn = params.get("return");
  const returnDestination = useMemo(() => parseNutritionTargetsReturnDestination(rawReturn), [rawReturn]);

  useEffect(() => {
    if (rawDate === selectedDate) return;
    const next = new URLSearchParams();
    next.set("date", selectedDate);
    if (returnDestination.kind === "custom") next.set("return", returnDestination.href);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [pathname, rawDate, returnDestination, router, selectedDate]);

  return <div className="space-y-4" dir={dir}>
    <PageHeading title={nt("title")} description={nt("description")} />
    <NutritionTargetSettings selectedDate={selectedDate} returnDestination={returnDestination} />
  </div>;
}

export function safeReturnHref(value: string | null | undefined, fallback: string) {
  return safeCustomNutritionTargetsReturnHref(value) ?? fallback;
}

export function currentNutritionTargetsReturnHref(value: string | null | undefined, selectedDate: string) {
  return resolveNutritionTargetsReturnHref(parseNutritionTargetsReturnDestination(value), selectedDate);
}
