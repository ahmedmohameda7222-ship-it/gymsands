from __future__ import annotations

import runpy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
runner_path = ROOT / "scripts/aw3b-finalize-runner.py"
candidate_path = ROOT / "supabase/migrations/20260724003000_active_workout_aw3b_final_logic_hardening.sql"
correction_path = ROOT / "supabase/migrations/20260724023000_active_workout_aw3b_post_apply_logic_corrections.sql"

candidate = candidate_path.read_text(encoding="utf-8")
baseline_start = candidate.index("CREATE TEMPORARY TABLE aw3b_final_baseline")
append_start = candidate.index("CREATE OR REPLACE FUNCTION private.append_workout_session_timeline_event")
graph_start = candidate.index("CREATE FUNCTION private.aw3b_graph_revision")
wrapper_start = candidate.index("CREATE OR REPLACE FUNCTION public.upsert_workout_set_logs_atomic")
post_start = candidate.index("DO $aw3b_final_postflight$")

baseline = candidate[baseline_start:append_start]
graph = candidate[graph_start:wrapper_start].replace(
    "REVOKE ALL ON FUNCTION private.aw3b_safe_structured_summary(uuid) FROM public, anon, authenticated, service_role;\n",
    "",
)
wrapper = candidate[wrapper_start:post_start].replace(
    "private.aw3b_safe_structured_summary",
    "private.aw3b_timeline_structured_summary",
)
wrapper = wrapper.replace(
    "  PERFORM set_config('plaivra.aw3b_defer_set_timeline', 'on', true);\n"
    "  v_result := private.aw3b_structured_upsert_workout_set_logs_atomic(p_user_id, p_session_id, v_canonical_logs);\n"
    "  PERFORM set_config('plaivra.aw3b_defer_set_timeline', 'off', true);\n",
    "  BEGIN\n"
    "    PERFORM set_config('plaivra.aw3b_defer_set_timeline', 'on', true);\n"
    "    v_result := private.aw3b_structured_upsert_workout_set_logs_atomic(p_user_id, p_session_id, v_canonical_logs);\n"
    "    PERFORM set_config('plaivra.aw3b_defer_set_timeline', 'off', true);\n"
    "  EXCEPTION WHEN OTHERS THEN\n"
    "    PERFORM set_config('plaivra.aw3b_defer_set_timeline', 'off', true);\n"
    "    RAISE;\n"
    "  END;\n",
)
postflight = candidate[post_start:].replace("aw3b_final", "aw3b_post_apply")
postflight = postflight.replace(
    "private.aw3b_safe_structured_summary",
    "private.aw3b_timeline_structured_summary",
)
postflight = postflight.replace(
    "     OR v_definition NOT LIKE '%private.aw3b_graph_revision%'",
    "     OR v_definition NOT LIKE '%private.aw3b_graph_revision%'\n"
    "     OR v_definition NOT LIKE '%v_existing_details%'\n"
    "     OR v_definition NOT LIKE '%v_existing_segment%'\n"
    "     OR v_definition NOT LIKE '%v_existing_metric%'\n"
    "     OR to_regprocedure('private.aw3b_canonicalize_actor_set_payload(jsonb,text)') IS NOT NULL",
)

preflight = """-- AW-3B post-apply logic corrections.
-- Forward-only correction after the immutable applied final-hardening migration.
-- Preserves every user row and keeps the released AW-3A compatibility marker unchanged.

DO $aw3b_post_apply_preflight$
DECLARE
  v_marker text;
  v_definition text;
BEGIN
  SELECT migration_version INTO STRICT v_marker
  FROM public.release_schema_compatibility
  WHERE singleton = true;
  IF v_marker <> '20260722161542' THEN
    RAISE EXCEPTION 'AW-3B post-apply correction requires released AW-3A marker 20260722161542; found %.', v_marker
      USING ERRCODE = '55000';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE name = 'active_workout_aw3b_final_logic_hardening'
      AND version IN ('20260724013000','20260724002022')
  ) THEN
    RAISE EXCEPTION 'AW-3B post-apply correction requires the immutable applied final-hardening migration.'
      USING ERRCODE = '55000';
  END IF;

  IF to_regprocedure('private.aw3b_canonicalize_actor_set_payload(jsonb,text)') IS NULL
     OR to_regprocedure('private.aw3b_timeline_structured_summary(uuid)') IS NULL
     OR to_regprocedure('private.aw3b_structured_upsert_workout_set_logs_atomic(uuid,uuid,jsonb)') IS NULL
     OR to_regprocedure('private.workout_set_detail_snapshot(uuid)') IS NULL
     OR to_regprocedure('private.workout_performance_metric_snapshot(uuid)') IS NULL
     OR to_regprocedure('public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb)') IS NULL
     OR to_regprocedure('public.complete_workout_session_atomic(uuid,uuid,jsonb,integer,text)') IS NULL THEN
    RAISE EXCEPTION 'AW-3B post-apply correction prerequisites are incomplete.' USING ERRCODE = '55000';
  END IF;
  IF to_regprocedure('private.aw3b_graph_revision(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'AW-3B post-apply correction is already or partially applied.' USING ERRCODE = '55000';
  END IF;

  SELECT pg_get_functiondef('public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb)'::regprocedure)
    INTO STRICT v_definition;
  IF v_definition NOT LIKE '%private.aw3b_canonicalize_actor_set_payload%'
     OR v_definition NOT LIKE '%private.aw3b_timeline_structured_summary%'
     OR v_definition NOT LIKE '%plaivra.aw3b_defer_set_timeline%'
     OR NOT has_function_privilege('authenticated','public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb)','EXECUTE')
     OR has_function_privilege('anon','public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'AW-3B post-apply correction refused an unexpected public authority.' USING ERRCODE = '55000';
  END IF;
END
$aw3b_post_apply_preflight$;

"""

correction_path.write_text(
    preflight
    + baseline
    + graph
    + wrapper
    + "\nDROP FUNCTION private.aw3b_canonicalize_actor_set_payload(jsonb,text);\n\n"
    + postflight,
    encoding="utf-8",
)
candidate_path.unlink()

runner = runner_path.read_text(encoding="utf-8")
runner = runner.replace(
    '"services/database/workout-sessions.ts",\n    \'\'\'export async function getWorkoutSessionLogs',
    '"services/database/workout-sessions-legacy-implementation.ts",\n    \'\'\'export async function getWorkoutSessionLogs',
    1,
)
runner = runner.replace(
    '"services/database/workout-sessions.ts",\n    \'\'\'    set_details: normalizeWorkoutSetDetailsRelation',
    '"services/database/workout-sessions-legacy-implementation.ts",\n    \'\'\'    set_details: normalizeWorkoutSetDetailsRelation',
    1,
)
section_start = runner.index("# Migration: always release timeline deferral")
section_end = runner.index("# Existing integration assertion follows", section_start)
runner = runner[:section_start] + runner[section_end:]
runner = runner.replace(
    '"supabase/migrations/20260724003000_active_workout_aw3b_final_logic_hardening.sql"',
    '"supabase/migrations/20260724023000_active_workout_aw3b_post_apply_logic_corrections.sql"',
)
runner = runner.replace(
    "private.aw3b_safe_structured_summary",
    "private.aw3b_timeline_structured_summary",
)
runner = runner.replace(
    "payload->'structuredSet'->'detail'->>'source'='chatgpt'",
    "payload->'structuredSet'->'details'->>'source'='chatgpt'",
)
runner_path.write_text(runner, encoding="utf-8")
runpy.run_path(str(runner_path), run_name="__main__")
