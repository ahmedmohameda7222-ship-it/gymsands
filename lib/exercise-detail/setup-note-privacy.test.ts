import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../../supabase/migrations/20260820060000_exercise_detail_setup_notes.sql", import.meta.url), "utf8");
const verification = readFileSync(new URL("../../supabase/verification/20260820060000_exercise_detail_setup_notes.sql", import.meta.url), "utf8");
const dataExport = readFileSync(new URL("../privacy/data-export.ts", import.meta.url), "utf8");
const store = readFileSync(new URL("../../services/exercise-detail/setup-note.ts", import.meta.url), "utf8");

describe("Exercise setup-note privacy lifecycle", () => {
  it("enforces one bounded note per owner and canonical exercise identity", () => {
    expect(migration).toContain("unique (user_id, exercise_identity)");
    expect(migration).toContain("char_length(note_body) between 1 and 1000");
    expect(migration).toContain("references auth.users(id) on delete cascade");
    expect(migration).toContain("alter table public.exercise_setup_notes enable row level security");
  });

  it("restricts all CRUD policies to auth.uid ownership and denies anonymous table access", () => {
    expect(migration.match(/user_id = \(select auth\.uid\(\)\)/g)?.length).toBeGreaterThanOrEqual(4);
    expect(migration).toContain("revoke all on table public.exercise_setup_notes from public, anon, authenticated, service_role");
    expect(verification).toContain("anonymous role can read exercise_setup_notes");
  });

  it("includes setup notes in portable export and the reviewed account purge authority", () => {
    expect(dataExport).toContain('"exercise_setup_notes"');
    expect(dataExport).toContain("result.data.exercise_setup_notes");
    expect(migration).toContain("delete from public.exercise_setup_notes where user_id = p_user_id");
    expect(migration).toContain("exercise_setup_notes_deleted");
    expect(migration).toContain("private.exercise_detail_v2_core_purge_account_application_data_atomic");
  });

  it("gives empty notes deterministic delete semantics rather than empty rows", () => {
    expect(store).toContain('if (!normalized)');
    expect(store).toContain('.from("exercise_setup_notes").delete()');
    expect(store).toContain("EXERCISE_SETUP_NOTE_MAX_LENGTH = 1000");
  });
});
