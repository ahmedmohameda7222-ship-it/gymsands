"use client";

import { History } from "lucide-react";

import { useTrainTranslation } from "@/lib/i18n/train";

export function WorkoutHistoryHeader() {
  const { tr } = useTrainTranslation();
  return (
    <header className="flex items-start gap-3" data-workout-history-header>
      <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
        <History className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          {tr("historyPageTitle")}
        </h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
          {tr("historyPageDescription")}
        </p>
      </div>
    </header>
  );
}
