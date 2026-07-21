#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";

const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GH_TOKEN;
const sourceHead = process.env.SOURCE_HEAD;

if (!repository || !token || !sourceHead) {
  throw new Error("GITHUB_REPOSITORY, GH_TOKEN, and SOURCE_HEAD are required.");
}

const apiBase = `https://api.github.com/repos/${repository}`;
const headers = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": "2022-11-28",
};

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...headers, ...(options.headers ?? {}) } });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${body}`);
  }
  return JSON.parse(body);
}

const source = await request(`${apiBase}/contents/.github/workflows/quality.yml?ref=${sourceHead}`);
let text = Buffer.from(source.content.replace(/\n/g, ""), "base64").toString("utf8");

const oldReplay = [
  "          supabase db start",
  "          supabase db reset --local --no-seed --version 20260720213000",
  "          database_url=\"postgresql://postgres:postgres@127.0.0.1:54322/postgres\"",
  "          marker_before=\"$(PGPASSWORD=postgres psql \"$database_url\" -X -A -t -v ON_ERROR_STOP=1 -c \"select migration_version from public.release_schema_compatibility where singleton\")\"",
  "          test \"$marker_before\" = \"20260711014500\"",
  "          PGPASSWORD=postgres psql \"$database_url\" -X -v ON_ERROR_STOP=1 -c \"update public.release_schema_compatibility set migration_version = '20260717051011' where singleton\"",
  "          supabase migration up --local",
  "          marker_after=\"$(PGPASSWORD=postgres psql \"$database_url\" -X -A -t -v ON_ERROR_STOP=1 -c \"select migration_version from public.release_schema_compatibility where singleton\")\"",
  "          test \"$marker_after\" = \"20260717051011\"",
  "          supabase db lint --local --schema public --level error --fail-on error",
  "",
].join("\n");

const newReplay = [
  "          supabase db start",
  "          correction_migration=\"supabase/migrations/20260721012814_active_workout_aw2a_execution_state_corrections.sql\"",
  "          temporary_correction=\"$(mktemp)\"",
  "          cp \"$correction_migration\" \"$temporary_correction\"",
  "          rm \"$correction_migration\"",
  "          restore_correction() { cp \"$temporary_correction\" \"$correction_migration\"; }",
  "          trap restore_correction EXIT",
  "          supabase db reset --local --no-seed",
  "          restore_correction",
  "          trap - EXIT",
  "          database_url=\"postgresql://postgres:postgres@127.0.0.1:54322/postgres\"",
  "          marker_before=\"$(PGPASSWORD=postgres psql \"$database_url\" -X -A -t -v ON_ERROR_STOP=1 -c \"select migration_version from public.release_schema_compatibility where singleton\")\"",
  "          test \"$marker_before\" = \"20260711014500\"",
  "          PGPASSWORD=postgres psql \"$database_url\" -X -v ON_ERROR_STOP=1 -c \"update public.release_schema_compatibility set migration_version = '20260717051011' where singleton\"",
  "          supabase migration up --local",
  "          marker_after=\"$(PGPASSWORD=postgres psql \"$database_url\" -X -A -t -v ON_ERROR_STOP=1 -c \"select migration_version from public.release_schema_compatibility where singleton\")\"",
  "          test \"$marker_after\" = \"20260717051011\"",
  "          supabase db lint --local --schema public --level error --fail-on error",
  "",
].join("\n");

if (!text.includes(oldReplay)) {
  throw new Error("Staged database replay block was not found.");
}
text = text.replace(oldReplay, newReplay);

for (const required of [
  "temporary_correction=\"$(mktemp)\"",
  "supabase db reset --local --no-seed",
  "supabase migration up --local",
  "test \"$marker_after\" = \"20260717051011\"",
]) {
  if (!text.includes(required)) throw new Error(`Replay fixture missing: ${required}`);
}

const blob = await request(`${apiBase}/git/blobs`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ content: Buffer.from(text, "utf8").toString("base64"), encoding: "base64" }),
});

mkdirSync("quality-reports", { recursive: true });
const output = { sourceHead, blobSha: blob.sha, byteLength: Buffer.byteLength(text) };
writeFileSync("quality-reports/replay-fix-blob.json", `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(JSON.stringify(output));
