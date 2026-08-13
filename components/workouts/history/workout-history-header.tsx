"use client";

import { useTrainTranslation } from "@/lib/i18n/train";

export function WorkoutHistoryHeader() {
  const { tr } = useTrainTranslation();
  return (
    <header data-workout-history-header>
      <div>
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
