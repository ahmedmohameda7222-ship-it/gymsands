import type { CatalogLocale } from "@/lib/activity-catalog/catalog-locale";

const INTERNAL_COPY = [
  /\bp10e\b/iu,
  /\b(?:canonical (?:identity|content)|internal (?:content|copy|release)|implementation(?:-facing)?|release (?:authority|provenance|version)|schema implementation|checksum|provenance|phase [a-z0-9-]+)\b/iu,
  /\b(?:kanonische[nrms]? (?:identität|inhalt)|implementierung(?:stext)?|prüfsumme|provenienz|release[- ](?:autorität|version))\b/iu,
  /(?:الهوية (?:الأساسية|المرجعية)|المحتوى التقني|بيانات المصدر الداخلية|مرحلة التنفيذ|مخطط التنفيذ|سجل الإصدار)/u,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/iu,
  /\b[0-9a-f]{64}\b/iu,
] as const;

export function userFacingCatalogText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || INTERNAL_COPY.some((pattern) => pattern.test(normalized))) return null;
  return normalized;
}

export function fallbackExerciseName(locale: CatalogLocale | string) {
  if (locale.toLowerCase().startsWith("de")) return "Übung";
  if (locale.toLowerCase().startsWith("ar")) return "تمرين";
  return "Exercise";
}
