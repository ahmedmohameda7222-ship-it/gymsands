"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTrainTranslation } from "@/lib/i18n/train";
import type { WorkoutHistoryDateRange, WorkoutHistoryPeriodMode } from "@/lib/workouts/history/date-range";

const modes: WorkoutHistoryPeriodMode[] = ["week", "month", "three-months", "custom"];

export function WorkoutHistoryPeriodControl({
  mode,
  range,
  customFrom,
  customTo,
  onModeChange,
  onPrevious,
  onNext,
  onCustomFromChange,
  onCustomToChange,
  onApplyCustom,
}: {
  mode: WorkoutHistoryPeriodMode;
  range: WorkoutHistoryDateRange;
  customFrom: string;
  customTo: string;
  onModeChange: (mode: WorkoutHistoryPeriodMode) => void;
  onPrevious: () => void;
  onNext: () => void;
  onCustomFromChange: (value: string) => void;
  onCustomToChange: (value: string) => void;
  onApplyCustom: () => void;
}) {
  const { locale, tr } = useTrainTranslation();
  const formatter = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: range.timezone });
  const displayTo = new Date(new Date(range.to).getTime() - 1);
  const labels = {
    week: tr("historyPeriodWeek"),
    month: tr("historyPeriodMonth"),
    "three-months": tr("historyPeriodThreeMonths"),
    custom: tr("historyPeriodCustom"),
  };

  return (
    <section className="rounded-[20px] border border-border/70 bg-card p-3 shadow-sm" aria-label={tr("historyPageTitle")}>
      <div className="flex gap-1 overflow-x-auto pb-1" role="group">
        {modes.map((value) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={mode === value ? "default" : "ghost"}
            className="min-h-10 shrink-0 rounded-xl px-3"
            aria-pressed={mode === value}
            onClick={() => onModeChange(value)}
          >
            {labels[value]}
          </Button>
        ))}
      </div>

      <div className="mt-2 grid grid-cols-[44px_1fr_44px] items-center gap-2">
        <Button type="button" variant="ghost" size="icon" className="size-11" onClick={onPrevious} disabled={mode === "custom"} aria-label={tr("historyPreviousPeriod")}>
          <ChevronLeft className="size-5 rtl:rotate-180" aria-hidden="true" />
        </Button>
        <p className="text-center text-sm font-medium text-foreground" aria-live="polite">
          {formatter.format(new Date(range.from))} – {formatter.format(displayTo)}
        </p>
        <Button type="button" variant="ghost" size="icon" className="size-11" onClick={onNext} disabled={mode === "custom"} aria-label={tr("historyNextPeriod")}>
          <ChevronRight className="size-5 rtl:rotate-180" aria-hidden="true" />
        </Button>
      </div>

      {mode === "custom" ? (
        <div className="mt-3">
          <div className="grid gap-3 border-t border-border/70 pt-3 sm:grid-cols-2">
            <Label className="space-y-1.5 text-xs text-muted-foreground">
              <span>{tr("historyCustomFrom")}</span>
              <Input type="date" value={customFrom} onChange={(event) => onCustomFromChange(event.target.value)} />
            </Label>
            <Label className="space-y-1.5 text-xs text-muted-foreground">
              <span>{tr("historyCustomTo")}</span>
              <Input type="date" value={customTo} onChange={(event) => onCustomToChange(event.target.value)} />
            </Label>
            <Button type="button" className="sm:col-span-2" onClick={onApplyCustom}>
              {tr("historyApplyPeriod")}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
