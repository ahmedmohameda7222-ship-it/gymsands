"use client";

import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type TrainWeekItem = {
  iso: string;
  date: Date;
  title: string;
  stateLabel: string;
  status: "active" | "completed" | "scheduled" | "skipped" | "rest";
  isToday: boolean;
};

export function TrainWeekSelector({
  items,
  selectedIso,
  onSelect,
  label,
  locale,
  todayLabel,
  selectedLabel,
  idBase,
  panelId
}: {
  items: TrainWeekItem[];
  selectedIso: string;
  onSelect: (iso: string) => void;
  label: string;
  locale: string;
  todayLabel: string;
  selectedLabel: string;
  idBase: string;
  panelId: string;
}) {
  return (
    <div
      className="grid snap-x grid-flow-col auto-cols-[104px] gap-2 overflow-x-auto pb-2 lg:grid-flow-row lg:grid-cols-7 lg:overflow-visible"
      role="tablist"
      aria-label={label}
      data-train-week-selector
    >
      {items.map((item) => {
        const selected = item.iso === selectedIso;
        return (
          <button
            type="button"
            role="tab"
            id={`${idBase}-tab-${item.iso}`}
            aria-controls={panelId}
            key={item.iso}
            onClick={() => onSelect(item.iso)}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            aria-current={item.isToday ? "date" : undefined}
            data-week-state={item.status}
            data-week-selected={selected || undefined}
            onKeyDown={(event) => {
              const tabs = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? []);
              const currentIndex = tabs.indexOf(event.currentTarget);
              const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
              const previousKey = rtl ? "ArrowRight" : "ArrowLeft";
              const nextKey = rtl ? "ArrowLeft" : "ArrowRight";
              let nextIndex = currentIndex;
              if (event.key === previousKey || event.key === "ArrowUp") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
              else if (event.key === nextKey || event.key === "ArrowDown") nextIndex = (currentIndex + 1) % tabs.length;
              else if (event.key === "Home") nextIndex = 0;
              else if (event.key === "End") nextIndex = tabs.length - 1;
              else return;
              event.preventDefault();
              const nextItem = items[nextIndex];
              if (!nextItem) return;
              onSelect(nextItem.iso);
              window.requestAnimationFrame(() => tabs[nextIndex]?.focus());
            }}
            className={cn(
              "min-h-[72px] snap-start rounded-2xl border p-2.5 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected
                ? "border-primary bg-primary/10 ring-1 ring-primary/25"
                : item.isToday
                  ? "border-primary/50 bg-primary/[0.04]"
                  : "border-border/70 bg-card"
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground">{item.date.toLocaleDateString(locale, { weekday: "short" })}</p>
                <p className="mt-0.5 text-base font-semibold">{item.date.getDate()}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                {item.isToday ? <Badge variant="outline" className="px-1.5 py-0 text-[10px]">{todayLabel}</Badge> : null}
                {selected && !item.isToday ? <span className="text-[10px] font-semibold text-primary">{selectedLabel}</span> : null}
              </div>
            </div>
            <p className="mt-1.5 line-clamp-1 text-xs font-semibold">{item.title}</p>
            <span className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              {item.status === "completed" ? <Check className="h-3.5 w-3.5 text-success" /> : <span className={cn("h-2 w-2 rounded-full", item.status === "active" ? "bg-primary" : item.status === "skipped" ? "bg-warning" : item.status === "scheduled" ? "bg-foreground/50" : "bg-muted-foreground/40")} />}
              {item.stateLabel}
            </span>
          </button>
        );
      })}
    </div>
  );
}
