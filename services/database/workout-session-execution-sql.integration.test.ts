import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const databaseUrl = process.env.PLAIVRA_AW2A_TEST_DATABASE_URL?.trim() ?? "";
const verificationFiles = [
  "supabase/verification/active-workout-aw2b-command-authority.sql",
  "supabase/verification/active-workout-aw2b-integration.sql"
] as const;

function runVerification(file: (typeof verificationFiles)[number]) {
  const absolutePath = resolve(process.cwd(), file);
  expect(existsSync(absolutePath), `${file} must remain a permanent verification asset.`).toBe(true);
  return execFileSync(
    "psql",
    [databaseUrl, "-X", "-v", "ON_ERROR_STOP=1", "-f", absolutePath],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD ?? "postgres" },
      maxBuffer: 16 * 1024 * 1024
    }
  );
}

describe.skipIf(!databaseUrl)("AW-2B permanent PostgreSQL verification assets", () => {
  it("executes the hardened schema/ACL contract against the replayed database", () => {
    expect(runVerification(verificationFiles[0])).toContain("AW-2B command-authority schema verification passed");
  }, 120_000);

  it("executes applied, replay, conflict, no-op, import, and lifecycle semantics in rollback", () => {
    expect(runVerification(verificationFiles[1])).toContain("AW-2B command integration verification passed");
  }, 120_000);
});
