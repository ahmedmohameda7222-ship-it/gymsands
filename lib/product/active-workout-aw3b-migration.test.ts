import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260722210312_active_workout_aw3b_structured_set_details.sql";
const migration = readFileSync(migrationPath, "utf8");
const hardeningMigration = readFileSync(
  "supabase/migrations/20260722224500_active_workout_aw3b_production_hardening.sql",
  "utf8",
);
const correctionMigration = readFileSync(
  "supabase/migrations/20260723010500_active_workout_aw3b_read_and_payload_corrections.sql",
  "utf8",
);

function filesUnder(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    if (["node_modules", ".next", ".git", "graphify-out"].includes(name))
      return [];
    return statSync(path).isDirectory()
      ? filesUnder(path)
      : [path.replaceAll("\\", "/")];
  });
}

describe("AW-3B forward migration contract", () => {
  it("creates the approved one-to-one detail and multi-stage segment model", () => {
    for (const table of [
      "exercise_log_set_details",
      "exercise_log_set_segments",
      "exercise_log_set_segment_metric_values",
    ])
      expect(migration).toContain(`create table public.${table}`);
    expect(migration).toContain("exercise_log_id uuid primary key");
    expect(migration).toContain("unique (exercise_log_id,segment_order)");
    expect(migration).toContain(
      "unique (segment_id,metric_key,metric_version,side)",
    );
    expect(migration).toContain(
      "references public.workout_performance_metric_definitions(metric_key,metric_version) on delete restrict",
    );
  });

  it("enforces ownership, cascade, RLS, and read-only member access", () => {
    expect(
      migration.match(/on delete cascade/g)?.length,
    ).toBeGreaterThanOrEqual(7);
    expect(migration).toContain(
      "foreign key (exercise_log_id,workout_session_id)",
    );
    expect(migration).toContain("foreign key (workout_session_id,user_id)");
    expect(migration).toContain(
      "foreign key (segment_id,exercise_log_id,workout_session_id,user_id)",
    );
    for (const table of [
      "exercise_log_set_details",
      "exercise_log_set_segments",
      "exercise_log_set_segment_metric_values",
    ]) {
      expect(migration).toContain(
        `alter table public.${table} enable row level security`,
      );
    }
    expect(correctionMigration).toContain(
      "user_id=(select auth.uid()) or (select private.is_admin())",
    );
    expect(migration).toContain(
      "revoke all on table public.exercise_log_set_details from public,anon,authenticated,service_role",
    );
    expect(migration).toContain(
      "grant select on table public.exercise_log_set_details,public.exercise_log_set_segments,public.exercise_log_set_segment_metric_values to authenticated",
    );
    expect(migration).not.toContain(
      "grant insert on table public.exercise_log_set_details to authenticated",
    );
  });

  it("keeps all detail, segment, metric, and completion writes atomic", () => {
    expect(migration).toContain(
      "rename to aw3b_core_upsert_workout_set_logs_atomic",
    );
    expect(migration).toContain(
      "v_result:=private.aw3b_core_upsert_workout_set_logs_atomic",
    );
    expect(migration).toContain("insert into public.exercise_log_set_details");
    expect(migration).toContain("insert into public.exercise_log_set_segments");
    expect(migration).toContain(
      "insert into public.exercise_log_set_segment_metric_values",
    );
    expect(migration).toContain(
      "private.validate_workout_performance_metric_value",
    );
    expect(migration).toContain("public.complete_workout_session_atomic");
  });

  it("implements create, clear, replacement, omitted preservation, and retry-stable timestamps", () => {
    expect(migration).toContain("if v_item ? 'set_details' then");
    expect(migration).toContain("if v_item ? 'segments' then");
    expect(migration).toContain("jsonb_typeof(v_item->'set_details')='null'");
    expect(migration).toContain(
      "delete from public.exercise_log_set_details where exercise_log_id=v_after.id",
    );
    expect(migration).toContain(
      "delete from public.exercise_log_set_segments existing",
    );
    expect(migration).toContain("not exists (");
    expect(migration).toContain("v_existing_captured_at");
    expect(migration).toContain("else old.updated_at end");
  });

  it("bounds every approved detail and source field", () => {
    expect(migration).toContain("rpe numeric null");
    expect(migration).toContain("rir numeric null");
    expect(migration).not.toContain("rpe numeric(3,1)");
    expect(migration).toContain("rpe between 0 and 10");
    expect(migration).toContain("rir between 0 and 20");
    expect(migration).toContain("char_length(notes)<=4000");
    expect(migration).toContain("char_length(planned_tempo) between 1 and 64");
    expect(migration).toContain("planned_tempo !~ '[[:cntrl:]]'");
    expect(migration).toContain(
      "side_mode in ('none','bilateral','left','right','alternating')",
    );
    expect(migration).toContain(
      "tempo_adherence in ('not_recorded','adhered','adjusted','missed')",
    );
    expect(migration).toContain(
      "source not in ('device','import') or source_provider is not null",
    );
  });

  it("backfills only exact former Plaivra tokens and preserves all remaining text", () => {
    expect(migration).toContain(
      "create or replace function private.normalize_exercise_log_set_type()",
    );
    expect(migration).toContain(
      "new.set_type:=private.workout_set_type(null,new.set_type)",
    );
    expect(migration).not.toContain(
      "new.set_type := private.workout_set_type(new.notes, null)",
    );
    expect(migration).toContain("regexp_split_to_table(l.notes,' \\| ')");
    expect(migration).toContain("^type:(warmup|working|normal|failure|drop)$");
    expect(migration).toContain("^RPE:(10(?:\\.0)?|[0-9](?:\\.[0-9])?)$");
    expect(migration).toContain(
      "^RIR:(20(?:\\.0)?|1[0-9](?:\\.[0-9])?|[0-9](?:\\.[0-9])?)$",
    );
    expect(migration).toContain(
      "string_agg(segment,' | ' order by ordinality) filter (where token_kind is null)",
    );
    expect(migration).toContain(
      "type_count<=1 and rpe_count<=1 and rir_count<=1",
    );
    expect(migration).toContain("'backfill',null,null");
    expect(migration).toContain(
      "expected rows %, actual rows %, expected tokens %, actual tokens %",
    );
    expect(migration).not.toMatch(/lower\([^\n]*notes[^\n]*\)/);
  });

  it("emits only bounded timeline fingerprints and suppresses no-op duplicates", () => {
    for (const key of [
      "setTypeChanged",
      "rpeChanged",
      "rirChanged",
      "tempoChanged",
      "sideModeChanged",
      "notesChanged",
      "segmentCount",
    ])
      expect(migration).toContain(`'${key}'`);
    expect(migration).toContain("v_structured_changed and not v_core_changed");
    expect(migration).toContain(
      "'runtime:set_edited:'||v_after.id::text||':aw3b:'||v_fingerprint",
    );
    const timelinePayload =
      migration
        .split("v_payload:=jsonb_build_object(")[1]
        ?.split("v_fingerprint:=")[0] ?? "";
    expect(timelinePayload).not.toContain("v_after.notes");
    expect(timelinePayload).not.toContain("v_details->>'notes'");
  });

  it("leaves the deployed compatibility marker untouched", () => {
    expect(migration).toContain(
      "v_marker not in ('20260722161542','20260721012814')",
    );
    expect(migration).toContain("if v_marker<>v_baseline.marker");
    expect(migration).not.toContain(
      "update public.release_schema_compatibility",
    );
  });

  it("hardens every new FK path and the shared metric registry without changing data", () => {
    for (const index of [
      "exercise_log_set_details_log_session_idx",
      "exercise_log_set_details_session_user_idx",
      "exercise_log_set_segments_log_session_idx",
      "exercise_log_set_segments_session_user_idx",
      "exercise_log_set_segment_metrics_segment_owner_idx",
      "exercise_log_set_segment_metrics_definition_idx",
    ])
      expect(hardeningMigration).toContain(`create index ${index}`);
    expect(hardeningMigration).toContain(
      "alter table public.workout_performance_metric_definitions enable row level security",
    );
    expect(hardeningMigration).toContain(
      "create policy workout_performance_metric_definitions_authenticated_select",
    );
    expect(hardeningMigration).toContain(
      "AW-3B hardening unexpectedly changed the compatibility marker.",
    );
    expect(hardeningMigration).not.toContain(
      "update public.release_schema_compatibility",
    );
  });

  it("corrects the PostgREST relation and bounds the public write authority forward-only", () => {
    expect(correctionMigration).toContain(
      "add constraint exercise_log_set_details_log_session_key",
    );
    expect(correctionMigration).toContain(
      "unique (exercise_log_id,workout_session_id)",
    );
    expect(correctionMigration).toContain(
      "drop index public.exercise_log_set_details_log_session_idx",
    );
    expect(correctionMigration).toContain(
      "set schema private",
    );
    expect(correctionMigration).toContain(
      "pg_column_size(v_logs)>16777216",
    );
    expect(correctionMigration).toContain(
      "if v_final_count>500",
    );
    expect(correctionMigration).toContain(
      "private.aw3b_structured_upsert_workout_set_logs_atomic",
    );
    expect(correctionMigration).toContain(
      "for update",
    );
    expect(correctionMigration).toContain(
      "revoke all on function private.aw3b_structured_upsert_workout_set_logs_atomic(uuid,uuid,jsonb)",
    );
    for (const relation of [
      "exercise_log_set_details",
      "exercise_log_set_segments",
      "exercise_log_set_segment_metric_values",
    ]) {
      expect(correctionMigration).toContain(
        `create policy ${relation}_owner_select`,
      );
    }
    expect(correctionMigration).toContain(
      "AW-3B correction unexpectedly changed the compatibility marker.",
    );
    expect(correctionMigration).not.toContain(
      "update public.release_schema_compatibility",
    );
  });

  it("finds no runtime direct write path to AW-3B tables", () => {
    const runtimeFiles = ["app", "components", "lib", "services"]
      .flatMap(filesUnder)
      .filter((file) => /\.(?:ts|tsx)$/.test(file))
      .filter((file) => !/\.(?:test|spec)\.(?:ts|tsx)$/.test(file));
    const directMutators = runtimeFiles.filter((file) => {
      const source = readFileSync(file, "utf8");
      return /\.from\(["']exercise_log_set_(?:details|segments|segment_metric_values)["']\)\s*\.(?:insert|update|delete|upsert)/.test(
        source,
      );
    });
    expect(directMutators).toEqual([]);
  });

  it("includes the entire owner-bound model in privacy export and account-deletion cascade", () => {
    const exportSource = readFileSync("lib/privacy/data-export.ts", "utf8");
    for (const table of [
      "exercise_log_set_details",
      "exercise_log_set_segments",
      "exercise_log_set_segment_metric_values",
    ])
      expect(exportSource).toContain(`"${table}"`);
    expect(exportSource).toContain("workouts.set_details");
    expect(exportSource).toContain("workouts.set_segments");
    expect(exportSource).toContain("workouts.set_segment_metric_values");
    expect(migration).toContain(
      "references public.exercise_logs(id,workout_session_id) on delete cascade",
    );
  });
});
