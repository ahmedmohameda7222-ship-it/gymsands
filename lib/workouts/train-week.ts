import { localDateToIso } from "@/lib/date-utils";

export const trainWeekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export function buildTrainWeek(weekStartsOn: "monday" | "sunday", now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStartIndex = weekStartsOn === "monday" ? 1 : 0;
  const offset = (start.getDay() - weekStartIndex + 7) % 7;
  start.setDate(start.getDate() - offset);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return { date, iso: localDateToIso(date), weekday: trainWeekdays[date.getDay()] };
  });
}
