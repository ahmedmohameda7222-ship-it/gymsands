"use client";

import Link from "next/link";
import { BookOpen, Clock3, ShieldCheck, Star } from "lucide-react";

import type { RecipeHomeRecord } from "@/services/nutrition-v1/server/recipe-workspace";

type Props = {
  recipe: RecipeHomeRecord;
  verified?: boolean;
};

function meta(recipe: RecipeHomeRecord) {
  const parts: string[] = [];
  if (recipe.status === "draft") parts.push("Draft");
  else if (recipe.servings) parts.push(`${recipe.servings} servings`);
  if (recipe.totalTimeMinutes !== null) parts.push(`${recipe.totalTimeMinutes} min`);
  if (recipe.cuisine) parts.push(recipe.cuisine);
  return parts.join(" · ");
}

export function RecipeRow({ recipe, verified = false }: Props) {
  const href = recipe.status === "draft" ? `/my-recipes/${recipe.recipeId}/edit` : `/my-recipes/${recipe.recipeId}`;
  return (
    <Link
      href={href}
      className="group flex min-h-[84px] items-center gap-3 rounded-2xl border border-border/70 bg-background px-3 py-2.5 transition hover:border-foreground/20 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted" aria-hidden="true">
        <BookOpen className="h-6 w-6 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <h3 className="truncate text-[15px] font-semibold leading-5">{recipe.name}</h3>
          {recipe.favorite ? <Star className="h-3.5 w-3.5 fill-current" aria-label="Favorite" /> : null}
          {verified ? <ShieldCheck className="h-3.5 w-3.5" aria-label="Plaivra Verified" /> : null}
        </div>
        <p className="mt-0.5 truncate text-sm text-muted-foreground">{meta(recipe) || "Recipe"}</p>
        {recipe.status === "draft" ? <span className="mt-1 inline-block text-xs font-medium text-foreground">Continue</span> : null}
      </div>
      {recipe.totalTimeMinutes !== null ? <Clock3 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" /> : null}
    </Link>
  );
}
