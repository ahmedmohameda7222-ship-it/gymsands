import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
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
const ownerId = "c2b00000-0000-4000-8000-000000000001";
let sessionId = "";

function sql(query: string) {
  if (!disposableDatabaseUrl) throw new Error("A disposable local Supabase database is required.");
  return execFileSync("psql", [disposableDatabaseUrl, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", query], {
    encoding: "utf8"
  }).trim();
}

function parseEnvelope(output: string) {
  const line = output.split(/\r?\n/).map((item) => item.trim()).find((item) => item.startsWith("{") && item.endsWith("}"));
  if (!line) throw new Error(`Command response JSON was not found in psql output: ${output}`);
  return JSON.parse(line) as {
    outcome: "applied" | "revision_conflict" | "no_op";
    replayed: boolean;
    revisionAfter: number;
  };
}

async function authCommand(query: string) {
  if (!disposableDatabaseUrl) throw new Error("A disposable local Supabase database is required.");
  const statement = `begin;
    set local role authenticated;
    set local "request.jwt.claim.sub"='${ownerId}';
    set local "request.jwt.claim.role"='authenticated';
    ${query};
    commit;`;
  return execFileAsync("psql", [disposableDatabaseUrl, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", statement], {
    encoding: "utf8"
  });
}

beforeAll(() => {
  if (!disposableDatabaseUrl) return;
  sql(`
    delete from auth.users where id='${ownerId}'::uuid;
    insert into auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    values ('${ownerId}','authenticated','authenticated','aw2b-concurrency@example.test','',
      '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now());
    insert into public.user_workout_plans(id,user_id,name,is_active,is_default,source,created_at,updated_at)
    values ('c2b00000-0000-4000-8000-000000000010','${ownerId}','AW-2B concurrency',true,true,'manual',now(),now());
    insert into public.user_workout_plan_days(id,plan_id,day_number,day_name,weekday,created_at,updated_at)
    values ('c2b00000-0000-4000-8000-000000000011','c2b00000-0000-4000-8000-000000000010',1,'AW-2B concurrency','Monday',now(),now());
    insert into public.user_workout_plan_exercises
      (id,plan_day_id,exercise_name,sets,reps,rest_seconds,sort_order,order_index,created_at)
    values ('c2b00000-0000-4000-8000-000000000012','c2b00000-0000-4000-8000-000000000011','AW-2B concurrency exercise',3,'8',60,1,1,now());
    insert into public.user_workout_sessions
      (id,user_id,user_workout_plan_id,plan_day_id,week_index,day_index,session_number,scheduled_date,day_title,status,created_at,updated_at)
    values ('c2b00000-0000-4000-8000-000000000014','${ownerId}','c2b00000-0000-4000-8000-000000000010','c2b00000-0000-4000-8000-000000000011',1,1,1,current_date,'AW-2B concurrency','scheduled',now(),now());
  `);
  const result = sql(`begin;
    set local role authenticated;
    set local "request.jwt.claim.sub"='${ownerId}';
    set local "request.jwt.claim.role"='authenticated';
    select public.start_or_resume_workout_session_atomic(
      '${ownerId}'::uuid,
      'c2b00000-0000-4000-8000-000000000011'::uuid,
      'c2b00000-0000-4000-8000-000000000014'::uuid
    )->'session'->>'id';
    commit;`);
  sessionId = result.split(/\r?\n/).find((line) => /^[0-9a-f-]{36}$/i.test(line.trim()))?.trim() ?? "";
  if (!sessionId) throw new Error(`Concurrency fixture session was not created: ${result}`);
});

afterAll(() => {
  if (disposableDatabaseUrl) sql(`delete from auth.users where id='${ownerId}'::uuid;`);
});

databaseDescribe("AW-2B PostgreSQL command concurrency", () => {
  it("serializes different command IDs at the same expected revision without lost updates", async () => {
    const commandA = `select public.apply_workout_session_execution_command_atomic(
      '${ownerId}'::uuid,'${sessionId}'::uuid,'c2b00000-0000-4000-8000-000000000101'::uuid,0,
      'move_cursor','{"active_snapshot_item_id":null,"active_item_order":1,"active_set_number":2,"view_state":"set_entry","controller_device_id":null}'::jsonb
    )::text`;
    const commandB = `select public.apply_workout_session_execution_command_atomic(
      '${ownerId}'::uuid,'${sessionId}'::uuid,'c2b00000-0000-4000-8000-000000000102'::uuid,0,
      'move_cursor','{"active_snapshot_item_id":null,"active_item_order":1,"active_set_number":3,"view_state":"set_entry","controller_device_id":null}'::jsonb
    )::text`;
    const [left, right] = await Promise.all([authCommand(commandA), authCommand(commandB)]);
    const responses = [parseEnvelope(left.stdout), parseEnvelope(right.stdout)];
    expect(responses.map((item) => item.outcome).sort()).toEqual(["applied", "revision_conflict"]);
    expect(sql(`select revision from public.workout_session_execution_states where workout_session_id='${sessionId}'::uuid`)).toBe("1");
    expect(sql(`select count(*) from public.workout_session_execution_commands where workout_session_id='${sessionId}'::uuid`)).toBe("2");
  });

  it("serializes an identical command ID into one mutation, one receipt, and one replay", async () => {
    const command = `select public.apply_workout_session_execution_command_atomic(
      '${ownerId}'::uuid,'${sessionId}'::uuid,'c2b00000-0000-4000-8000-000000000103'::uuid,1,
      'reset_timer','{"controller_device_id":null}'::jsonb
    )::text`;
    const [left, right] = await Promise.all([authCommand(command), authCommand(command)]);
    const responses = [parseEnvelope(left.stdout), parseEnvelope(right.stdout)];
    expect(responses.filter((item) => item.outcome === "applied")).toHaveLength(2);
    expect(responses.filter((item) => item.replayed)).toHaveLength(1);
    expect(responses.every((item) => item.revisionAfter === 2)).toBe(true);
    expect(sql(`select revision from public.workout_session_execution_states where workout_session_id='${sessionId}'::uuid`)).toBe("2");
    expect(sql(`select count(*) from public.workout_session_execution_commands where workout_session_id='${sessionId}'::uuid and command_id='c2b00000-0000-4000-8000-000000000103'::uuid`)).toBe("1");
  });
});
