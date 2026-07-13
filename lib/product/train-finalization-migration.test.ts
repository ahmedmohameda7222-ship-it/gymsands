import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const path = "supabase/migrations/20260713170000_finalize_train_schedule_delete_integrity.sql";
const migration = readFileSync(path, "utf8");

function bodyBetween(start: string, end: string) {
  const startIndex = migration.indexOf(start);
  const endIndex = migration.indexOf(end, startIndex + start.length);
  expect(startIndex, start).toBeGreaterThanOrEqual(0);
  expect(endIndex, end).toBeGreaterThan(startIndex);
  return migration.slice(startIndex, endIndex);
}

describe("final Train schedule and deletion migration", () => {
  it("is append-only, transactional, and replaces every unsafe date-less overload", () => {
    expect(migration.trimStart().toLowerCase().startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().toLowerCase().endsWith("commit;")).toBe(true);

    for (const signature of [
      "activate_workout_plan_atomic(uuid, uuid, timestamptz)",
      "create_workout_plan_atomic(uuid, jsonb, boolean)",
      "archive_workout_plan_atomic(uuid, uuid, text)",
      "delete_workout_plan_atomic(uuid, uuid, boolean)",
      "save_workout_plan_day_atomic(uuid, uuid, jsonb, timestamptz)",
      "save_workout_plan_atomic(uuid, uuid, jsonb, timestamptz)"
    ]) {
      expect(migration).toContain(`drop function if exists public.${signature}`);
    }
  });

  it("requires one explicit local date and never derives user scheduling from current_date", () => {
    for (const name of [
      "activate_workout_plan_atomic",
      "create_workout_plan_atomic",
      "archive_workout_plan_atomic",
      "delete_workout_plan_atomic",
      "save_workout_plan_day_atomic",
      "save_workout_plan_atomic"
    ]) {
      expect(migration, name).toMatch(
        new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\s*\\([\\s\\S]*?p_schedule_start_date\\s+date`, "i")
      );
    }
    expect(migration).not.toMatch(/\bcurrent_date\b/i);
    expect(migration).toContain("An explicit local schedule start date is required");
  });

  it("validates and writes the plan graph before delegating schedule generation exactly once", () => {
    const createBody = bodyBetween(
      "create or replace function public.create_workout_plan_atomic",
      "create or replace function public.archive_workout_plan_atomic"
    );
    expect(createBody).toContain("Validate the complete nested graph before the first write");
    expect(createBody).not.toContain("insert into public.user_workout_sessions");
    expect(createBody.match(/public\.activate_workout_plan_atomic\s*\(/g)).toHaveLength(1);
    expect(createBody.indexOf("insert into public.user_workout_plan_exercises")).toBeLessThan(
      createBody.indexOf("public.activate_workout_plan_atomic")
    );
  });

  it("retires only explicit-boundary scheduled rows and generates one replacement schedule", () => {
    const activateBody = bodyBetween(
      "create or replace function public.activate_workout_plan_atomic",
      "create or replace function public.create_workout_plan_atomic"
    );
    expect(activateBody).toMatch(/delete from public\.user_workout_sessions[\s\S]*status = 'scheduled'[\s\S]*scheduled_date >= p_schedule_start_date/i);
    expect(activateBody).toContain("for update");
    expect(activateBody.match(/insert into public\.user_workout_sessions/g)).toHaveLength(1);
    expect(activateBody).toContain("extract(dow from p_schedule_start_date)");
    expect(activateBody).toContain("p_schedule_start_date + ((v_week_index - 1) * 7 + v_day_offset)");
  });

  it("preserves history while allowing confirmed deletion of future scheduled-only rows", () => {
    const archiveBody = bodyBetween(
      "create or replace function public.archive_workout_plan_atomic",
      "create or replace function public.delete_workout_plan_atomic"
    );
    expect(archiveBody).toMatch(/status = 'scheduled'[\s\S]*scheduled_date >= p_schedule_start_date/i);
    expect(archiveBody).toContain("archived_at = clock_timestamp()");
    expect(archiveBody).toContain("public.activate_workout_plan_atomic");

    const deleteBody = bodyBetween(
      "create or replace function public.delete_workout_plan_atomic",
      "-- Remove the unsafe legacy overloads"
    );
    expect(deleteBody).toContain("Explicit confirmation is required to delete a workout plan.");
    expect(deleteBody).toContain("This plan has workout history. Archive it instead.");
    expect(deleteBody).toContain("s.status <> 'scheduled'");
    expect(deleteBody).toContain("s.started_at is not null");
    expect(deleteBody).toContain("s.completed_at is not null");
    expect(deleteBody).toContain("s.skipped_at is not null");
    expect(deleteBody).toContain("s.scheduled_date < p_schedule_start_date");
    expect(deleteBody).toContain("from public.exercise_logs");
    expect(deleteBody).toContain("from public.user_exercise_logs");
    expect(deleteBody).toMatch(/delete from public\.user_workout_sessions[\s\S]*status = 'scheduled'[\s\S]*scheduled_date >= p_schedule_start_date/i);
    expect(deleteBody.indexOf("delete from public.user_workout_sessions")).toBeLessThan(
      deleteBody.indexOf("delete from public.user_workout_plans")
    );
    expect(deleteBody).toContain("'already_missing', true");
  });

  it("routes active day and full-plan saves through one explicit-date canonical schedule rebuild", () => {
    const daySaveBody = bodyBetween(
      "create or replace function public.save_workout_plan_day_atomic",
      "create or replace function public.save_workout_plan_atomic"
    );
    expect(daySaveBody).toContain("p_schedule_start_date date");
    expect(daySaveBody).toContain("p_rebuild_schedule boolean default true");
    expect(daySaveBody).toMatch(/if v_plan\.is_active and p_rebuild_schedule then[\s\S]*public\.activate_workout_plan_atomic/i);

    const fullSaveBody = bodyBetween(
      "create or replace function public.save_workout_plan_atomic",
      "-- Remove the unsafe legacy overloads"
    );
    expect(fullSaveBody).toContain("p_schedule_start_date date");
    expect(fullSaveBody).toMatch(/public\.save_workout_plan_day_atomic\s*\([\s\S]*?p_schedule_start_date,\s*null,\s*false\s*\)/i);
    expect(fullSaveBody.match(/public\.activate_workout_plan_atomic\s*\(/g)).toHaveLength(1);
  });

  it("revokes public and anonymous execution and grants only authenticated runtime roles", () => {
    for (const signature of [
      "activate_workout_plan_atomic(uuid, uuid, date, timestamptz)",
      "create_workout_plan_atomic(uuid, jsonb, boolean, date)",
      "archive_workout_plan_atomic(uuid, uuid, text, date)",
      "delete_workout_plan_atomic(uuid, uuid, boolean, date)",
      "save_workout_plan_day_atomic(uuid, uuid, jsonb, date, timestamptz, boolean)",
      "save_workout_plan_atomic(uuid, uuid, jsonb, date, timestamptz)"
    ]) {
      expect(migration).toContain(`revoke all on function public.${signature}`);
      expect(migration).toContain(`grant execute on function public.${signature}`);
    }
    expect(migration.match(/from public, anon, authenticated, service_role;/g)).toHaveLength(6);
    expect(migration.match(/to authenticated, service_role;/g)).toHaveLength(6);
  });
});
