const migrationHints = [
  "does not exist",
  "schema cache",
  "column",
  "relation",
  "table",
  "42P01",
  "42703",
  "PGRST204"
];

const authHints = ["JWT", "token", "auth", "unauthorized", "permission", "RLS", "row-level"];

export function rawErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "";
}

export function userSafeError(error: unknown, fallback = "Please try again. Your typed input has been kept.") {
  const raw = rawErrorMessage(error);
  if (!raw) return fallback;
  if (isMigrationError(error)) return "Something went wrong while loading this data. Please try again. If this keeps happening, contact support.";
  if (authHints.some((hint) => raw.toLowerCase().includes(hint.toLowerCase()))) return "Your session or permissions need to be refreshed. Sign in again or retry.";
  if (/network|fetch|timeout|failed to fetch/i.test(raw)) return "Network request failed. Check your connection and retry.";
  if (/duplicate|unique/i.test(raw)) return "This looks like a duplicate entry. Review the item before saving again.";
  if (/not null|null value|constraint|violates/i.test(raw)) return "Some required information is missing. Review the highlighted fields and try again.";
  return fallback;
}

export function technicalErrorDetails(error: unknown) {
  return process.env.NODE_ENV === "development" ? rawErrorMessage(error) : undefined;
}

export function isMigrationError(error: unknown) {
  const raw = rawErrorMessage(error);
  return migrationHints.some((hint) => raw.toLowerCase().includes(hint.toLowerCase()));
}

export function logRecoverableError(context: string, error: unknown) {
  if (process.env.NODE_ENV !== "production") {
    console.error(`[${context}]`, error);
  }
}
