"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addDays, addMonths, formatIsoDate, localDateToIso, safeIsoDate, startOfMonth, startOfWeek } from "@/lib/date-utils";

export { addDays, addMonths };

export function safeDate(value: string | null) {
  return safeIsoDate(value);
}

export function monthStart(date: string) {
  return startOfMonth(date);
}

export function weekStart(date: string) {
  return startOfWeek(date);
}

export function calendarRangeStart(month: string) {
  return weekStart(monthStart(month));
}

export function calendarRangeEnd(month: string) {
  return addDays(calendarRangeStart(month), 41);
}

function calendarDays(month: string) {
  const start = calendarRangeStart(month);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

function monthLabel(month: string) {
  return formatIsoDate(monthStart(month), { month: "long", year: "numeric" });
}

export function longDate(date: string) {
  return formatIsoDate(date, { weekday: "long", month: "long", day: "numeric" });
}

export function displayDate(date: string) {
  return formatIsoDate(date, { month: "short", day: "numeric" });
}

export function CompactCalendar({
  month,
  selectedDate,
  plannedDates,
  onMonthChange,
  onSelectDate
}: {
  month: string;
  selectedDate: string;
  plannedDates: string[];
  onMonthChange: (date: string) => void;
  onSelectDate: (date: string) => void;
}) {
  const days = calendarDays(month);
  const planned = new Set(plannedDates);
  return (
    <div className="rounded-md border bg-card p-3 text-card-foreground">
      <div className="mb-3 flex items-center justify-between">
        <Button size="icon" variant="ghost" type="button" onClick={() => onMonthChange(addMonths(month, -1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <p className="font-semibold">{monthLabel(month)}</p>
        <Button size="icon" variant="ghost" type="button" onClick={() => onMonthChange(addMonths(month, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-muted-foreground">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1">
        {days.map((day) => {
          const isCurrentMonth = day.slice(0, 7) === month.slice(0, 7);
          const isSelected = day === selectedDate;
          const isToday = day === localDateToIso(new Date());
          const hasPlan = planned.has(day);
          return (
            <button
              key={day}
              type="button"
              onClick={() => onSelectDate(day)}
              className={`relative rounded-md border px-1 py-2 text-sm transition ${isSelected ? "border-primary bg-primary text-primary-foreground" : isToday ? "border-primary/60 bg-primary/10" : "border-transparent hover:bg-muted"} ${isCurrentMonth ? "" : "opacity-40"}`}
            >
              {Number(day.slice(-2))}
              {hasPlan ? <span className={`absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full ${isSelected ? "bg-primary-foreground" : "bg-primary"}`} /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
