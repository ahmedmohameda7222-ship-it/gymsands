const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

export function todayIso() {
  return new Date().toLocaleDateString("en-CA");
}

export function isIsoDate(value: string | null | undefined) {
  return Boolean(value && isoDatePattern.test(value));
}

export function localDateToIso(date: Date) {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

export function parseIsoDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

export function isoFromUtcDate(date: Date) {
  return `${date.getUTCFullYear()}-${padDatePart(date.getUTCMonth() + 1)}-${padDatePart(date.getUTCDate())}`;
}

export function utcDate(date: string) {
  const { year, month, day } = parseIsoDate(date);
  return new Date(Date.UTC(year, month - 1, day));
}

export function addDays(date: string, days: number) {
  const { year, month, day } = parseIsoDate(date);
  return isoFromUtcDate(new Date(Date.UTC(year, month - 1, day + days)));
}

export function addMonths(date: string, months: number) {
  const { year, month } = parseIsoDate(startOfMonth(date));
  return isoFromUtcDate(new Date(Date.UTC(year, month - 1 + months, 1)));
}

export function startOfWeek(date: string) {
  const first = utcDate(date);
  first.setUTCDate(first.getUTCDate() - first.getUTCDay());
  return isoFromUtcDate(first);
}

export function endOfWeek(date: string) {
  return addDays(startOfWeek(date), 6);
}

export function startOfMonth(date: string) {
  const { year, month } = parseIsoDate(date);
  return `${year}-${padDatePart(month)}-01`;
}

export function endOfMonth(date: string) {
  const { year, month } = parseIsoDate(date);
  return isoFromUtcDate(new Date(Date.UTC(year, month, 0)));
}

export function datesInRange(start: string, end: string) {
  const dates: string[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) dates.push(date);
  return dates;
}

export function daysBetween(start: string, end: string) {
  return Math.round((utcDate(end).getTime() - utcDate(start).getTime()) / (1000 * 60 * 60 * 24));
}

export function formatIsoDate(
  date: string,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }
) {
  return utcDate(date).toLocaleDateString("en-US", { timeZone: "UTC", ...options });
}

export function safeIsoDate(value: string | null | undefined) {
  return isIsoDate(value) ? value : null;
}
