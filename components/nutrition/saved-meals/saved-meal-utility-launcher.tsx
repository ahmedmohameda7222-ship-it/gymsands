"use client";

import { useState } from "react";
import { Bookmark } from "lucide-react";

import { SavedMealUtility } from "@/components/nutrition/saved-meals/saved-meal-utility";
import { useNutritionV1Translation } from "@/lib/i18n/nutrition-v1";

const copy = {
  en: "Manage Saved Meals",
  de: "Gespeicherte Mahlzeiten verwalten",
  ar: "إدارة الوجبات المحفوظة",
} as const;

export function SavedMealUtilityLauncher() {
  const { language, dir } = useNutritionV1Translation();
  const [open, setOpen] = useState(false);
  return (
    <div dir={dir} className="mx-auto flex w-full max-w-5xl justify-end px-4 pt-4 sm:px-6">
      <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-border px-3 text-sm font-medium hover:bg-muted">
        <Bookmark className="h-4 w-4" />{copy[language]}
      </button>
      <SavedMealUtility open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
