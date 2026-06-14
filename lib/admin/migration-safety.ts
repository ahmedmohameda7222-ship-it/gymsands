type SupabaseLikeError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

export function isMissingDatabaseObject(error: unknown) {
  const err = asSupabaseError(error);
  const message = [err.message, err.details, err.hint].filter(Boolean).join(" ").toLowerCase();

  return (
    err.code === "42P01" ||
    err.code === "42703" ||
    message.includes("does not exist") ||
    message.includes("could not find") ||
    message.includes("schema cache") ||
    message.includes("column") && message.includes("not found")
  );
}

export function friendlyDatabaseWarning(label: string, error: unknown, migrationName?: string) {
  if (!error) return null;

  if (isMissingDatabaseObject(error)) {
    return migrationName
      ? `${label} is unavailable because ${migrationName} has not been applied to the live Supabase database. Run the migration in Supabase SQL Editor, then refresh this page.`
      : `${label} is unavailable because a required database object is missing. Apply the pending Supabase migrations, then refresh this page.`;
  }

  return `${label} is temporarily unavailable. Refresh and try again.`;
}

export function developmentDatabaseDetails(errors: unknown[]) {
  if (process.env.NODE_ENV !== "development") return undefined;
  const details = errors.map((error) => {
    const err = asSupabaseError(error);
    return [err.code, err.message, err.details, err.hint].filter(Boolean).join(" | ");
  }).filter(Boolean);

  return details.length ? details : undefined;
}

function asSupabaseError(error: unknown): SupabaseLikeError {
  if (!error || typeof error !== "object") return {};
  return error as SupabaseLikeError;
}
