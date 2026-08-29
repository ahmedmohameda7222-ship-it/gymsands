"use client";

import { useNutritionV1Translation } from "@/lib/i18n/nutrition-v1";

function dayLabel(date: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(new Date(`${date}T12:00:00`));
}

function dayNumber(date: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { day: "numeric" }).format(new Date(`${date}T12:00:00`));
}

export function WeekStrip({ dates, selectedDate, today, onSelect }: {
  dates: string[];
  selectedDate: string;
  today: string;
  onSelect: (date: string) => void;
}) {
  const { nt, language, dir, locale } = useNutritionV1Translation();
  return (
    <div className="grid grid-cols-[repeat(7,minmax(44px,1fr))] gap-1" aria-label={language === "ar" ? "أيام الأسبوع" : language === "de" ? "Wochentage" : "Week days"} dir={dir}>
      {dates.map((date) => {
        const selected = date === selectedDate;
        const isToday = date === today;
        return (
          <button
            key={date}
            type="button"
            aria-current={selected ? "date" : undefined}
            aria-label={`${dayLabel(date, locale)} ${dayNumber(date, locale)}${isToday ? `, ${nt("today")}` : ""}`}
            onClick={() => onSelect(date)}
            className={`min-h-14 min-w-11 rounded-xl border px-1 py-2 text-center transition-colors ${selected ? "border-foreground bg-foreground text-background" : "border-border bg-background hover:bg-muted"}`}
          >
            <span className="block text-[11px] font-medium uppercase tracking-wide opacity-70">{isToday ? nt("today") : dayLabel(date, locale)}</span>
            <span className="mt-0.5 block text-base font-semibold">{dayNumber(date, locale)}</span>
          </button>
        );
      })}
    </div>
  );
}
