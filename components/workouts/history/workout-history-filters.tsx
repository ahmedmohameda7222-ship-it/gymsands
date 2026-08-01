"use client";

import { Filter, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTrainTranslation } from "@/lib/i18n/train";
import type { WorkoutHistoryLifecycle } from "@/types/workout-history";

const lifecycleKeys: Array<[WorkoutHistoryLifecycle, "historyCompletedStatus" | "historyPartialStatus" | "historySkippedStatus" | "historyCancelledStatus"]> = [
  ["completed", "historyCompletedStatus"],
  ["partial", "historyPartialStatus"],
  ["skipped", "historySkippedStatus"],
  ["cancelled", "historyCancelledStatus"],
];

export type WorkoutHistoryFilterValue = {
  statuses: WorkoutHistoryLifecycle[];
  progressOnly: boolean;
};

export function WorkoutHistoryFilters({
  open,
  value,
  resultCount,
  onOpenChange,
  onChange,
  onClear,
}: {
  open: boolean;
  value: WorkoutHistoryFilterValue;
  resultCount: number | null;
  onOpenChange: (open: boolean) => void;
  onChange: (value: WorkoutHistoryFilterValue) => void;
  onClear: () => void;
}) {
  const { tr } = useTrainTranslation();
  const [draft, setDraft] = useState(value);
  const activeLabels = [
    ...value.statuses
      .filter((status) => status === "skipped" || status === "cancelled")
      .map((status) => tr(status === "skipped" ? "historySkippedStatus" : "historyCancelledStatus")),
    ...(value.progressOnly ? [tr("historyProgressOnly")] : []),
  ].slice(0, 3);

  function toggleStatus(status: WorkoutHistoryLifecycle) {
    const statuses = draft.statuses.includes(status)
      ? draft.statuses.filter((entry) => entry !== status)
      : [...draft.statuses, status];
    setDraft({ ...draft, statuses });
  }
  const draftMatchesApplied = draft.progressOnly === value.progressOnly
    && draft.statuses.length === value.statuses.length
    && draft.statuses.every((status) => value.statuses.includes(status));

  function changeOpen(nextOpen: boolean) {
    onOpenChange(nextOpen);
  }

  function clearAll() {
    const cleared: WorkoutHistoryFilterValue = {
      statuses: ["completed", "partial"],
      progressOnly: false,
    };
    setDraft(cleared);
    onClear();
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" className="h-12 rounded-2xl" onClick={() => changeOpen(true)}>
          <Filter className="size-4" aria-hidden="true" />
          {tr("historyFiltersAction")}
        </Button>
        {activeLabels.map((label) => (
          <span key={label} className="inline-flex min-h-9 items-center rounded-full bg-primary/10 px-3 text-xs font-medium text-primary">
            {label}
          </span>
        ))}
        {activeLabels.length ? (
          <Button type="button" variant="ghost" size="sm" onClick={clearAll}>
            <X className="size-4" aria-hidden="true" />
            {tr("historyClearFilters")}
          </Button>
        ) : null}
      </div>

      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent layout="dialog" closeLabel={tr("historyCloseFilters")} className="pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          <DialogHeader>
            <DialogTitle>{tr("historyFilterTitle")}</DialogTitle>
            <DialogDescription>{tr("historyFilterDescription")}</DialogDescription>
          </DialogHeader>
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-semibold text-foreground">{tr("historyStatusLabel")}</legend>
            {lifecycleKeys.map(([status, key]) => (
              <label key={status} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-border/70 px-3 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={draft.statuses.includes(status)}
                  onChange={() => toggleStatus(status)}
                />
                <span>{tr(key)}</span>
              </label>
            ))}
          </fieldset>
          <label className="mt-3 flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-border/70 px-3 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={draft.progressOnly}
              onChange={(event) => setDraft({ ...draft, progressOnly: event.target.checked })}
            />
            <span>{tr("historyProgressOnly")}</span>
          </label>
          <div className="mt-5 grid gap-2 sm:grid-cols-[1fr_auto]">
            <Button type="button" className="min-h-12" onClick={() => {
              onChange(draft);
              onOpenChange(false);
            }}>
              {resultCount === null || !draftMatchesApplied
                ? tr("historyFiltersAction")
                : tr("historyApplyFilters", { count: resultCount })}
            </Button>
            <Button type="button" variant="outline" className="min-h-12" onClick={clearAll}>
              {tr("historyClearFilters")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
