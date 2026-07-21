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

const dependencyMarker = "      - name: Check production dependencies\n";
const baseExpression = "${{ github.event.pull_request.base.sha }}";
const parityStep = [
  "      - name: Verify full unit failure parity",
  "        if: steps.scope.outputs.database == 'true'",
  `        run: node scripts/check-aw2a-unit-failure-parity.mjs --base \"${baseExpression}\" --output-dir quality-reports`,
  "",
].join("\n");
if (!text.includes(dependencyMarker)) throw new Error("Dependency marker missing.");
text = text.replace(dependencyMarker, `${parityStep}${dependencyMarker}`);

const oldReplay = [
  "          supabase db start",
  "          supabase db reset --local --no-seed",
  "          supabase db lint --local --schema public --level error --fail-on error",
  "          database_url=\"postgresql://postgres:postgres@127.0.0.1:54322/postgres\"",
  "",
].join("\n");
const newReplay = [
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
if (!text.includes(oldReplay)) throw new Error("Database replay marker missing.");
text = text.replace(oldReplay, newReplay);

const oldUpload = [
  "      - name: Upload AW-2A database validation evidence",
  "        if: always() && steps.scope.outputs.database == 'true'",
  "        uses: actions/upload-artifact@v4",
  "        with:",
  "          name: aw2a-database-validation-46571eee8fa13cc22b4190668678abae03cc643a",
  "          path: quality-reports/aw2a-database-validation.log",
  "          if-no-files-found: warn",
  "          retention-days: 14",
  "",
].join("\n");
const artifactExpression = "${{ github.event.pull_request.head.sha || github.sha }}";
const newUpload = [
  "      - name: Upload AW-2A validation evidence",
  "        if: always() && steps.scope.outputs.database == 'true'",
  "        uses: actions/upload-artifact@v4",
  "        with:",
  `          name: aw2a-validation-${artifactExpression}`,
  "          path: |",
  "            quality-reports/aw2a-database-validation.log",
  "            quality-reports/aw2a-unit-failure-parity.json",
  "          if-no-files-found: warn",
  "          retention-days: 14",
  "",
].join("\n");
if (!text.includes(oldUpload)) throw new Error("AW-2A upload marker missing.");
text = text.replace(oldUpload, newUpload);

for (const required of [
  "check-aw2a-unit-failure-parity.mjs",
  "supabase db reset --local --no-seed --version 20260720213000",
  "supabase migration up --local",
  "quality-reports/aw2a-unit-failure-parity.json",
]) {
  if (!text.includes(required)) throw new Error(`Final Quality workflow missing: ${required}`);
}

const blob = await request(`${apiBase}/git/blobs`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ content: Buffer.from(text, "utf8").toString("base64"), encoding: "base64" }),
});

mkdirSync("quality-reports", { recursive: true });
const output = {
  sourceHead,
  blobSha: blob.sha,
  byteLength: Buffer.byteLength(text),
};
writeFileSync("quality-reports/final-quality-blob.json", `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(JSON.stringify(output));
