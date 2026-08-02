import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260801160000_workout_history_correction_and_soft_delete.sql",
  "utf8",
);
const reader = readFileSync(
  "services/workouts/history/server-reader.ts",
  "utf8",
);
const clientReader = readFileSync(
  "services/workouts/history/reader.ts",
  "utf8",
);
const records = readFileSync(
  "services/workouts/history/verified-records.ts",
  "utf8",
);
const projections = readFileSync("lib/mcp/context-projections.ts", "utf8");
const executor = readFileSync(
  "lib/mcp/tool-executor-implementation.ts",
  "utf8",
);
const exportSource = readFileSync("lib/privacy/data-export-legacy.ts", "utf8");

describe("WH-7 soft delete, restore, and purge integration", () => {
  it("sets a 30-day window, preserves the canonical root, and restores original dates", () => {
    expect(migration).toContain(
      "purge_after=clock_timestamp()+interval '30 days'",
    );
    expect(migration).toContain(
      "set deleted_at=null,purge_after=null,history_revision=history_revision+1",
    );
    expect(migration).not.toMatch(/scheduled_session_id\s*=/);
  });

  it("hides deleted sessions while retaining suppression identities", () => {
    expect(
      reader.match(/\.is\("deleted_at", null\)/g)?.length,
    ).toBeGreaterThanOrEqual(2);
    expect(reader).toContain('.select("scheduled_session_id")');
    expect(clientReader).toContain('.is("deleted_at", null)');
    expect(records).toContain('.is("deleted_at", null)');
    expect(projections).toContain('.is("deleted_at", null)');
    expect(executor).toContain('.is("deleted_at", null)');
  });

  it("keeps deleted roots in account export until cascaded purge", () => {
    expect(exportSource).toContain('"workout_sessions"');
    expect(exportSource).not.toMatch(/workout_sessions[\s\S]{0,120}deleted_at/);
    expect(migration).toContain(
      "references public.workout_sessions(id,user_id) on delete cascade",
    );
    expect(migration).toContain(
      "delete from public.workout_sessions where id=p_session_id",
    );
  });

  it("requires explicit permanent confirmation and exposes dry-run cleanup", () => {
    expect(migration).toContain("not coalesce(p_confirm_permanent,false)");
    expect(migration).toContain("if p_dry_run then");
    expect(migration).toContain(
      "'purged_count',case when p_dry_run then 0 else v_count end",
    );
  });
});
