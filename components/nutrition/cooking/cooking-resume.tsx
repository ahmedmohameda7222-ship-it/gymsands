"use client";

import { RotateCcw, UtensilsCrossed } from "lucide-react";

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
  const recipe = session.frozenRecipeSnapshot.recipe;
  const name = typeof recipe.name === "string" ? recipe.name : "Recipe";
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-[620px] items-center px-4 py-8 sm:px-6">
      <section className="w-full rounded-2xl border border-border bg-background p-5 sm:p-6" aria-labelledby="resume-cooking-heading">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Cooking Session found</p>
        <h1 id="resume-cooking-heading" className="mt-2 break-words text-2xl font-semibold tracking-tight">{name}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Your frozen Recipe version, step progress, and timers are available to continue.</p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <button type="button" disabled={busy} onClick={onResume} className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-foreground px-4 text-sm font-semibold text-background disabled:opacity-50">
            <UtensilsCrossed className="h-4 w-4" aria-hidden="true" />Resume
          </button>
          <button type="button" disabled={busy} onClick={onStartOver} className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-medium hover:bg-muted disabled:opacity-50">
            <RotateCcw className="h-4 w-4" aria-hidden="true" />Start Over
          </button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Start Over begins the same frozen published Recipe version from the beginning.</p>
      </section>
    </main>
  );
}
