import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const databaseUrl = process.env.PLAIVRA_AW2A_TEST_DATABASE_URL;

function isDisposableLocalSupabase(value: string | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return ["localhost", "127.0.0.1", "::1"].includes(url.hostname) && url.port === "54322";
  } catch {
    return false;
  }
}

const disposableDatabaseUrl = isDisposableLocalSupabase(databaseUrl) ? databaseUrl : null;
const databaseDescribe = disposableDatabaseUrl ? describe.sequential : describe.skip;

databaseDescribe("AW-2A PostgreSQL execution-state integration", () => {
  it("proves initialization, isolation, integrity, revision, lifecycle, and account deletion", () => {
    const result = execFileSync(
      "psql",
      [
        disposableDatabaseUrl!,
        "-X",
        "-v",
        "ON_ERROR_STOP=1",
        "-f",
        resolve(process.cwd(), "supabase/verification/active-workout-aw2a-integration.sql")
      ],
      { encoding: "utf8", stdio: "pipe" }
    );
    expect(result).toContain("ROLLBACK");
  });
});
