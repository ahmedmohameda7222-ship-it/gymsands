import "server-only";
import { createSupabaseAdminClient, hasSupabaseAdminConfig } from "@/lib/server/supabase-admin";

export type DatabaseCompatibility = {
  available: boolean;
  version: string;
  migrationVersion: string | null;
};

export async function getDatabaseSchemaCompatibility(): Promise<DatabaseCompatibility> {
  if (!hasSupabaseAdminConfig()) return { available: false, version: "unavailable", migrationVersion: null };
  const result = await createSupabaseAdminClient()
    .from("release_schema_compatibility")
    .select("version,migration_version")
    .eq("singleton", true)
    .maybeSingle();
  if (result.error || !result.data?.version) {
    return { available: false, version: "unavailable", migrationVersion: null };
  }
  return {
    available: true,
    version: String(result.data.version),
    migrationVersion: typeof result.data.migration_version === "string" ? result.data.migration_version : null
  };
}
