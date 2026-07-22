import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/20260716215602_muscle_intelligence_phase1_foundation.sql";
const verificationPath = "supabase/verification/muscle-intelligence-phase1.sql";
const migration = readFileSync(migrationPath, "utf8").replaceAll("\r\n", "\n").toLowerCase();
const verification = readFileSync(verificationPath, "utf8").replaceAll("\r\n", "\n").toLowerCase();
const qualityWorkflow = readFileSync(".github/workflows/quality.yml", "utf8");
const privacyExport = [
  readFileSync("lib/privacy/data-export.ts", "utf8"),
  readFileSync("lib/privacy/data-export-legacy.ts", "utf8")
].join("\n");
const adr = readFileSync("docs/architecture/decisions/0005-muscle-intelligence-taxonomy-and-mapping-authority.md", "utf8");
const canonical = readFileSync("docs/architecture/canonical-domain-model.md", "utf8");
const migrationLedger = JSON.parse(readFileSync("supabase/migration-ledger.json", "utf8")) as {
  pendingCount: number;
  unresolvedCount: number;
  historyRepair: { state: string };
  entries: Array<{ localFile: string; state: string }>;
};

const tables = [
  "exercise_provider_links",
  "exercise_muscle_mapping_sets",
  "exercise_muscle_mapping_entries",
  "user_custom_exercise_mapping_sets",
  "user_custom_exercise_mapping_entries"
];

const muscleIds = [
  "pectoralis_major", "anterior_deltoid", "lateral_deltoid", "posterior_deltoid", "trapezius",
  "latissimus_dorsi", "upper_back", "biceps_brachii", "triceps_brachii", "forearms", "rotator_cuff",
  "serratus_anterior", "rectus_abdominis", "obliques", "erector_spinae", "gluteus_maximus",
  "gluteus_medius", "quadriceps", "hamstrings", "adductors", "hip_flexors", "gastrocnemius",
  "soleus", "tibialis_anterior"
];

const expectedColumns: Record<string, string[]> = {
  exercise_provider_links: ["id", "exercise_id", "provider", "provider_activity_id", "provider_slug", "provider_version", "verification_status", "verified_at", "created_at", "updated_at"],
  exercise_muscle_mapping_sets: ["id", "exercise_id", "mapping_version", "status", "source", "schema_version", "checksum", "published_at", "retired_at", "created_at", "updated_at"],
  exercise_muscle_mapping_entries: ["id", "mapping_set_id", "muscle_id", "role", "contribution", "side_scope", "sort_order", "created_at"],
  user_custom_exercise_mapping_sets: ["id", "user_id", "custom_exercise_id", "mapping_version", "status", "schema_version", "checksum", "published_at", "retired_at", "created_at", "updated_at"],
  user_custom_exercise_mapping_entries: ["id", "mapping_set_id", "muscle_id", "role", "contribution", "side_scope", "sort_order", "created_at"]
};

describe("Muscle Intelligence Phase 1 migration contract", () => {
  it("is one forward-only transaction with exactly the approved additive tables", () => {
    expect(migration.trimStart().startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
    for (const table of tables) {
      expect(migration).toContain(`create table public.${table}`);
      expect(migration).toContain(`alter table public.${table} enable row level security`);
      const tableDefinition = migration.match(new RegExp(`create table public\\.${table} \\(([\\s\\S]*?)\\n\\);`))?.[1];
      expect(tableDefinition, `missing definition for ${table}`).toBeDefined();
      for (const column of expectedColumns[table]) {
        expect(tableDefinition).toMatch(new RegExp(`\\b${column}\\b`));
      }
    }
    expect(migration).not.toMatch(/drop\s+table/);
    expect(migration).not.toContain("create table public.muscle");
  });

  it("enforces canonical IDs, role/contribution pairs, uniqueness, and composite ownership", () => {
    const checks = [...migration.matchAll(/constraint (?:exercise_muscle_mapping_entries_muscle_check|user_custom_exercise_mapping_entries_muscle_check) check \(muscle_id in \(([\s\S]*?)\)\)/g)];
    expect(checks).toHaveLength(2);
    for (const check of checks) {
      const ids = [...check[1].matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
      expect(ids).toEqual(muscleIds);
      expect(new Set(ids).size).toBe(24);
    }
    expect(migration).toContain("role = 'primary' and contribution in (1.00, 0.75)");
    expect(migration).toContain("role = 'secondary' and contribution in (0.50, 0.25)");
    expect(migration).toContain("role = 'stabilizer' and contribution = 0.00");
    expect(migration).toContain("unique (mapping_set_id, muscle_id)");
    expect(migration).toContain("unique (provider, provider_activity_id)");
    expect(migration).toContain("foreign key (custom_exercise_id, user_id)");
    expect(migration).toContain("references public.user_custom_exercises(id, user_id)");
  });

  it("protects publication, immutability, and one-current-version invariants", () => {
    expect(migration).toContain("where status = 'published'");
    expect(migration).toContain("published or retired global mapping entries are immutable");
    expect(migration).toContain("published or retired custom mapping entries are immutable");
    expect(migration).toContain("requires at least one primary entry");
    expect(migration).toContain("checksum does not match canonical content");
    expect(migration).toContain("for update");
    expect(migration).toContain("set status = 'retired'");
    expect(migration).toContain("set status = 'published'");
  });

  it("hardens RLS, function search paths, and grants without embedding a service secret", () => {
    expect(migration).toContain("security definer\nset search_path = ''");
    expect(migration).toContain("(select private.is_admin())");
    expect(migration).toContain("user_id = (select auth.uid())");
    expect(migration).toContain("revoke all on function public.publish_exercise_muscle_mapping_set(uuid) from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.publish_user_custom_exercise_mapping_set(uuid) to authenticated, service_role");
    expect(migration).not.toMatch(/service[_-]?role[_-]?(?:key|secret)\s*=/);
    expect(verification).toContain("member global write unexpectedly succeeded");
    expect(verification).toContain("cross-owner custom mapping-set read denial failed");
    expect(verification).toContain("published global mapping entry mutation unexpectedly succeeded");
  });

  it("executes the disposable Phase 1 verification in the authoritative Quality database preflight", () => {
    expect(qualityWorkflow).toContain(
      'PGPASSWORD=postgres psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -v ON_ERROR_STOP=1 -f supabase/verification/muscle-intelligence-phase1.sql'
    );
    expect(verification.trimEnd().endsWith("rollback;")).toBe(true);
    expect(verification.indexOf("select pg_temp.assert_intruder_custom_insert_denied(:'custom_b_set_id'::uuid)")).toBeLessThan(
      verification.indexOf("select public.publish_user_custom_exercise_mapping_set(:'custom_b_set_id'::uuid)")
    );
  });

  it("retains the complete cross-owner and immutable-version executable proof", () => {
    const requiredVerificationMarkers = [
      "cross-owner custom mapping-entry read denial failed",
      "assert_intruder_custom_set_update_zero_rows",
      "assert_intruder_custom_set_delete_zero_rows",
      "assert_intruder_custom_entry_update_zero_rows",
      "assert_intruder_custom_entry_delete_zero_rows",
      "assert_intruder_custom_publish_denied",
      "assert_custom_published_entry_insert_immutable",
      "assert_custom_published_entry_update_immutable",
      "assert_custom_published_entry_delete_immutable",
      "assert_custom_retired_entry_update_immutable",
      "assert_custom_retired_entry_delete_immutable",
      "custom version-2 atomic replacement failed",
      "custom version-2 publication idempotency failed",
      "assert_global_retired_entry_immutable",
      "assert_global_current_published_entry_immutable"
    ];
    for (const marker of requiredVerificationMarkers) {
      expect(verification).toContain(marker);
    }
  });

  it("exports only owner-scoped custom mappings and documents the no-runtime-cutover boundary", () => {
    expect(privacyExport).toContain('"user_custom_exercise_mapping_sets"');
    expect(privacyExport).toContain('"user_custom_exercise_mapping_entries"');
    expect(privacyExport).not.toContain('owned.exercise_muscle_mapping_sets');
    expect(privacyExport).not.toContain('owned.exercise_provider_links');
    expect(adr).toContain("code-authoritative 24-muscle taxonomy");
    expect(adr).toContain("no name-only mapping");
    expect(canonical.toLowerCase()).toContain("phase 1 does not change train runtime behavior");
  });

  it("keeps Phase 1 applied while later migration state remains truthfully classified", () => {
    const pendingEntries = migrationLedger.entries.filter((entry) => entry.state === "pending");
    const expectedReconciliationState = pendingEntries.length > 0 ? "pending" : "reconciled";
    expect(migrationLedger.entries.find((entry) => entry.localFile === "20260716215602_muscle_intelligence_phase1_foundation.sql")?.state).toBe("applied");
    expect(migrationLedger.pendingCount).toBe(pendingEntries.length);
    expect(migrationLedger.unresolvedCount).toBe(migrationLedger.pendingCount);
    expect(migrationLedger.historyRepair.state).toBe(expectedReconciliationState);
  });
});
