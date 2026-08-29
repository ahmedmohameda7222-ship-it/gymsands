"use client";

import Link from "next/link";

import type { CookingLocalSession } from "@/lib/nutrition-v1/cooking-local-store";

type Language = "en" | "de" | "ar";

type Copy = {
  complete: string;
  prepared: (count: string) => string;
  next: string;
  diary: string;
  plan: string;
  savedMeal: string;
  close: string;
  separation: string;
};

const copy: Record<Language, Copy> = {
  en: {
    complete: "Cooking complete",
    prepared: (count) => `${count} servings prepared`,
    next: "What next?",
    diary: "Add to Diary",
    plan: "Add to Meal Plan",
    savedMeal: "Save as Meal",
    close: "Close",
    separation: "Cooking completion is separate from eating. Choose an action only if you want to continue.",
  },
  de: {
    complete: "Kochen abgeschlossen",
    prepared: (count) => `${count} Portionen zubereitet`,
    next: "Wie weiter?",
    diary: "Zum Tagebuch hinzufügen",
    plan: "Zum Essensplan hinzufügen",
    savedMeal: "Als Mahlzeit speichern",
    close: "Schließen",
    separation: "Abgeschlossenes Kochen bedeutet nicht automatisch, dass die Mahlzeit gegessen wurde.",
  },
  ar: {
    complete: "اكتمل الطهي",
    prepared: (count) => `تم تحضير ${count} حصة`,
    next: "ماذا بعد؟",
    diary: "إضافة إلى اليوميات",
    plan: "إضافة إلى خطة الوجبات",
    savedMeal: "حفظ كوجبة",
    close: "إغلاق",
    separation: "اكتمال الطهي لا يعني أن الوجبة تم تناولها تلقائيًا.",
  },
};

function positiveNumber(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function displayNumber(value: number) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function recipeName(session: CookingLocalSession) {
  const value = session.frozenRecipeSnapshot.recipe.name;
  return typeof value === "string" && value.trim() ? value.trim() : "Recipe";
}

function handoffHref(session: CookingLocalSession, destination: "diary" | "meal_plan" | "saved_meal") {
  const params = new URLSearchParams({
    source: "recipe",
    recipeId: session.recipeId,
    recipeVersionId: session.recipeVersionId,
    quantity: "1",
    destination,
  });
  const pathname = destination === "meal_plan" ? "/my-meal-plan" : "/calories";
  return `${pathname}?${params.toString()}`;
}

export function CookingCompletion({
  session,
  language = "en",
  onClose,
}: {
  session: CookingLocalSession;
  language?: Language;
  onClose: () => void;
}) {
  const text = copy[language];
  const baseServings = positiveNumber(session.frozenRecipeSnapshot.recipe.servings, 1);
  const preparedServings = baseServings * positiveNumber(session.servingScale, 1);

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-xl flex-col justify-center px-4 py-8 sm:px-6" dir={language === "ar" ? "rtl" : "ltr"}>
      <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{text.complete}</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight"><bdi dir="auto">{recipeName(session)}</bdi></h1>
      <p className="mt-2 text-sm text-muted-foreground">{text.prepared(displayNumber(preparedServings))}</p>
      <p className="mt-6 text-base font-semibold">{text.next}</p>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{text.separation}</p>

      <nav className="mt-5 divide-y divide-border border-y border-border" aria-label={text.next}>
        <Link href={handoffHref(session, "diary")} className="flex min-h-14 items-center justify-between gap-4 px-1 text-base font-medium hover:bg-muted/50">
          <span>{text.diary}</span><span aria-hidden="true">›</span>
        </Link>
        <Link href={handoffHref(session, "meal_plan")} className="flex min-h-14 items-center justify-between gap-4 px-1 text-base font-medium hover:bg-muted/50">
          <span>{text.plan}</span><span aria-hidden="true">›</span>
        </Link>
        <Link href={handoffHref(session, "saved_meal")} className="flex min-h-14 items-center justify-between gap-4 px-1 text-base font-medium hover:bg-muted/50">
          <span>{text.savedMeal}</span><span aria-hidden="true">›</span>
        </Link>
      </nav>

      <button type="button" onClick={onClose} className="mt-4 min-h-12 w-full rounded-xl border border-border px-4 text-sm font-semibold hover:bg-muted">
        {text.close}
      </button>
    </main>
  );
}
