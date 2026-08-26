"use client";

import Link from "next/link";
import { BookOpen, Clock3, ShieldCheck, Star } from "lucide-react";

import { useNutritionV1Translation } from "@/lib/i18n/nutrition-v1";
import type { RecipeHomeRecord } from "@/services/nutrition-v1/server/recipe-workspace";

type Props = {
  recipe: RecipeHomeRecord;
  verified?: boolean;
};

function meta(recipe: RecipeHomeRecord, language: "en" | "de" | "ar", locale: string) {
  const parts: string[] = [];
  if (recipe.status === "draft") parts.push(language === "ar" ? "مسودة" : language === "de" ? "Entwurf" : "Draft");
  else if (recipe.servings) parts.push(language === "ar" ? `${new Intl.NumberFormat(locale).format(recipe.servings)} حصص` : language === "de" ? `${new Intl.NumberFormat(locale).format(recipe.servings)} Portionen` : `${new Intl.NumberFormat(locale).format(recipe.servings)} servings`);
  if (recipe.totalTimeMinutes !== null) parts.push(language === "ar" ? `${new Intl.NumberFormat(locale).format(recipe.totalTimeMinutes)} دقيقة` : `${new Intl.NumberFormat(locale).format(recipe.totalTimeMinutes)} min`);
  if (recipe.cuisine) parts.push(recipe.cuisine);
  return parts.join(" · ");
}

export function RecipeRow({ recipe, verified = false }: Props) {
  const { language, dir, locale } = useNutritionV1Translation();
  const href = recipe.status === "draft" ? `/my-recipes/${recipe.recipeId}/edit` : `/my-recipes/${recipe.recipeId}`;
  return (
    <Link
      href={href}
      dir={dir}
      className="group flex min-h-[84px] items-center gap-3 rounded-2xl border border-border/70 bg-background px-3 py-2.5 transition hover:border-foreground/20 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted" aria-hidden="true">
        <BookOpen className="h-6 w-6 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <h3 className="truncate text-[15px] font-semibold leading-5"><bdi dir="auto">{recipe.name}</bdi></h3>
          {recipe.favorite ? <Star className="h-3.5 w-3.5 fill-current" aria-label={language === "ar" ? "مفضلة" : language === "de" ? "Favorit" : "Favorite"} /> : null}
          {verified ? <ShieldCheck className="h-3.5 w-3.5" aria-label={language === "ar" ? "موثّق من Plaivra" : language === "de" ? "Von Plaivra verifiziert" : "Plaivra Verified"} /> : null}
        </div>
        <p className="mt-0.5 truncate text-sm text-muted-foreground"><bdi dir="auto">{meta(recipe, language, locale) || (language === "ar" ? "وصفة" : language === "de" ? "Rezept" : "Recipe")}</bdi></p>
        {recipe.status === "draft" ? <span className="mt-1 inline-block text-xs font-medium text-foreground">{language === "ar" ? "متابعة" : language === "de" ? "Fortsetzen" : "Continue"}</span> : null}
      </div>
      {recipe.totalTimeMinutes !== null ? <Clock3 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" /> : null}
    </Link>
  );
}
