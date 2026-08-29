"use client";

import { RotateCcw, UtensilsCrossed } from "lucide-react";

import { useNutritionV1Translation } from "@/lib/i18n/nutrition-v1";
import type { CookingLocalSession } from "@/lib/nutrition-v1/cooking-local-store";

export function CookingResume({
  session,
  onResume,
  onStartOver,
  busy = false,
}: {
  session: CookingLocalSession;
  onResume: () => void;
  onStartOver: () => void;
  busy?: boolean;
}) {
  const { nt, language, dir } = useNutritionV1Translation();
  const recipe = session.frozenRecipeSnapshot.recipe;
  const name = typeof recipe.name === "string" ? recipe.name : "Recipe";
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-[620px] items-center px-4 py-8 sm:px-6" dir={dir} lang={language}>
      <section className="w-full rounded-2xl border border-border bg-background p-5 sm:p-6" aria-labelledby="resume-cooking-heading">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{language === "ar" ? "تم العثور على جلسة طهي" : language === "de" ? "Kochsitzung gefunden" : "Cooking Session found"}</p>
        <h1 id="resume-cooking-heading" className="mt-2 break-words text-2xl font-semibold tracking-tight"><bdi dir="auto">{name}</bdi></h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{language === "ar" ? "نسخة الوصفة المجمدة وتقدم الخطوات والمؤقتات جاهزة للمتابعة." : language === "de" ? "Die eingefrorene Rezeptversion, der Schrittfortschritt und die Timer können fortgesetzt werden." : "Your frozen Recipe version, step progress, and timers are available to continue."}</p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <button type="button" disabled={busy} onClick={onResume} className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-foreground px-4 text-sm font-semibold text-background disabled:opacity-50">
            <UtensilsCrossed className="h-4 w-4" aria-hidden="true" />{nt("cookingResume")}
          </button>
          <button type="button" disabled={busy} onClick={onStartOver} className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-medium hover:bg-muted disabled:opacity-50">
            <RotateCcw className="h-4 w-4" aria-hidden="true" />{nt("cookingStartOver")}
          </button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{language === "ar" ? "البدء من جديد يستخدم نفس نسخة الوصفة المنشورة المجمدة من البداية." : language === "de" ? "Neu starten beginnt dieselbe eingefrorene veröffentlichte Rezeptversion von vorn." : "Start Over begins the same frozen published Recipe version from the beginning."}</p>
      </section>
    </main>
  );
}
