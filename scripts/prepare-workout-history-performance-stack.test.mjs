import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  MINIMAL_API_SERVICE_EXCLUDES,
  assertLocalApiReady,
  localStackRepairPlan,
  parseSupabaseStatusEnv,
} from "./prepare-workout-history-performance-stack.mjs";

const source = readFileSync(
  "scripts/prepare-workout-history-performance-stack.mjs",
  "utf8",
).replaceAll("\r\n", "\n");

test("status parser accepts quoted Supabase CLI environment output", () => {
  assert.deepEqual(
    parseSupabaseStatusEnv(
      'DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"\nAPI_URL=http://127.0.0.1:54321\nSERVICE_ROLE_KEY=secret\n',
    ),
    {
      DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
      API_URL: "http://127.0.0.1:54321",
      SERVICE_ROLE_KEY: "secret",
    },
  );
});

test("database-only stack requires a data-preserving service-plane restart", () => {
  assert.equal(
    localStackRepairPlan({
      DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    }),
    "restart-preserving-data",
  );
  assert.equal(
    localStackRepairPlan({
      DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
      API_URL: "http://127.0.0.1:54321",
      SERVICE_ROLE_KEY: "secret",
    }),
    "already-ready",
  );
  assert.equal(localStackRepairPlan({}), "start");
});

test("minimal stack retains the services required by the REST API contract", () => {
  for (const required of ["gotrue", "kong", "postgrest"]) {
    assert.equal(MINIMAL_API_SERVICE_EXCLUDES.includes(required), false);
  }
  assert.match(source, /\["stop", "--project-id", LOCAL_PROJECT_ID\]/u);
  assert.doesNotMatch(source, /--no-backup/u);
});

test("readiness validation accepts only the disposable local API and database ports", () => {
  assert.doesNotThrow(() => assertLocalApiReady({
    DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    API_URL: "http://127.0.0.1:54321",
    SERVICE_ROLE_KEY: "secret",
  }));
  assert.throws(
    () => assertLocalApiReady({
      DB_URL: "postgresql://postgres:postgres@example.com:54322/postgres",
      API_URL: "https://example.com",
      SERVICE_ROLE_KEY: "secret",
    }),
    /non-disposable endpoint/u,
  );
});
