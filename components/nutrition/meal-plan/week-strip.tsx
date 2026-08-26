"use client";

function dayLabel(date: string) {
  return new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(new Date(`${date}T12:00:00`));
}

function dayNumber(date: string) {
  return new Intl.DateTimeFormat(undefined, { day: "numeric" }).format(new Date(`${date}T12:00:00`));
}

export function WeekStrip({ dates, selectedDate, today, onSelect }: {
  dates: string[];
  selectedDate: string;
  today: string;
  onSelect: (date: string) => void;
}) {
  return (
    <div className="grid grid-cols-7 gap-1" aria-label="Week days">
      {dates.map((date) => {
        const selected = date === selectedDate;
        const isToday = date === today;
        return (
          <button
            key={date}
            type="button"
            aria-current={selected ? "date" : undefined}
            aria-label={`${dayLabel(date)} ${dayNumber(date)}${isToday ? ", Today" : ""}`}
            onClick={() => onSelect(date)}
            className={`min-h-14 min-w-11 rounded-xl border px-1 py-2 text-center transition-colors ${selected ? "border-foreground bg-foreground text-background" : "border-border bg-background hover:bg-muted"}`}
          >
            <span className="block text-[11px] font-medium uppercase tracking-wide opacity-70">{isToday ? "Today" : dayLabel(date)}</span>
            <span className="mt-0.5 block text-base font-semibold">{dayNumber(date)}</span>
          </button>
        );
      })}
    </div>
  );
}