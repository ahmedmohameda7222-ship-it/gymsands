#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { REQUIRED_GOLDEN_SEARCH_CASE_IDS } from "../lib/food-catalog/portability/search-restore-verifier.ts";

const SHA40 = /^[0-9a-f]{40}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CURRENT_GENERATION_ID = "71000000-0000-4000-8000-000000000901";
const STALE_GENERATION_ID = "71000000-0000-4000-8000-000000000903";
const CURRENT_FOOD_ID = "71000000-0000-4000-8000-000000000101";
const FIXTURE_OWNER_ID = "71000000-0000-4000-8000-000000000001";
const GOLDEN_PREFIX = "__PLAN7_GOLDEN__";
const GOLDEN_SQL = new URL("../supabase/verification/food-catalog-plan7-portability-search-golden-runtime.sql", import.meta.url);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

function runPsql(databaseUrl, sql) {
  const result = spawnSync("psql", [databaseUrl, "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Search runtime evidence SQL failed: ${(result.stderr ?? "").trim()}`);
  return (result.stdout ?? "").trim();
}

function runPsqlScript(databaseUrl, sql) {
  const result = spawnSync("psql", [databaseUrl, "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1"], {
    input: sql,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Search runtime golden SQL failed: ${(result.stderr ?? "").trim()}`);
  return result.stdout ?? "";
}

function jsonQuery(databaseUrl, sql) {
  const text = runPsql(databaseUrl, sql);
  if (!text) throw new Error("Search runtime evidence query returned no JSON.");
  return JSON.parse(text);
}

export function buildAuthenticatedSearchSql(searchExpression, userId = FIXTURE_OWNER_ID) {
  if (typeof searchExpression !== "string" || !searchExpression.trim()) throw new Error("Authenticated search expression is required.");
  if (!UUID.test(userId)) throw new Error("Authenticated search fixture owner must be a UUID.");
  const escapedUserId = userId.replaceAll("'", "''");
  return `WITH plan7_auth_context AS MATERIALIZED (\n  SELECT set_config('request.jwt.claim.sub','${escapedUserId}',true) AS subject\n)\nSELECT (${searchExpression})::text\nFROM plan7_auth_context;`;
}

function requireGoldenMatrix(matrix) {
  const required = [...REQUIRED_GOLDEN_SEARCH_CASE_IDS];
  if (!matrix || matrix.passed !== true || matrix.caseCount !== required.length) {
    throw new Error("Restored search golden matrix is missing required cases.");
  }
  if (!Array.isArray(matrix.caseIds) || JSON.stringify(matrix.caseIds) !== JSON.stringify(required)) {
    throw new Error("Restored search golden matrix required-case identity mismatch.");
  }
  if (!SHA256.test(String(matrix.resultSha256 ?? ""))) throw new Error("Restored search golden matrix result hash is invalid.");
}

export function buildSearchRuntimeEvidence({ headSha, currentGenerationId, currentResult, staleResult, currentRebuild, staleRebuild, documentCounts, goldenMatrix }) {
  if (!SHA40.test(headSha)) throw new Error("Search runtime evidence requires an exact head SHA.");
  if (currentGenerationId !== CURRENT_GENERATION_ID) throw new Error("Search runtime evidence is not bound to the expected current generation.");
  const currentItems = Array.isArray(currentResult?.items) ? currentResult.items : [];
  const staleItems = Array.isArray(staleResult?.items) ? staleResult.items : [];
  const currentVisible = currentItems.length > 0 && currentItems[0]?.id === CURRENT_FOOD_ID;
  const staleGenerationIsolationVerified = staleItems.length === 0;
  const rebuildVerified = Boolean(currentRebuild?.projectionChecksumSha256)
    && Boolean(staleRebuild?.projectionChecksumSha256)
    && Number(documentCounts?.current) > 0
    && Number(documentCounts?.stale) > 0;
  if (!currentVisible) throw new Error("Canonical V2 search did not return the current-generation fixture Food first.");
  if (!staleGenerationIsolationVerified) throw new Error("Canonical V2 search leaked stale-generation Food into current results.");
  if (!rebuildVerified) throw new Error("Search projection rebuild evidence is incomplete.");
  requireGoldenMatrix(goldenMatrix);

  return Object.freeze({
    format: "plaivra-food-catalog-restored-search-runtime-evidence",
    version: 1,
    headSha,
    providerNetworkUsed: false,
    currentGenerationId,
    currentFoodId: CURRENT_FOOD_ID,
    currentProjectionChecksumSha256: String(currentRebuild.projectionChecksumSha256),
    staleProjectionChecksumSha256: String(staleRebuild.projectionChecksumSha256),
    documentCounts: Object.freeze({ current: Number(documentCounts.current), stale: Number(documentCounts.stale) }),
    rebuildVerified: true,
    goldenSearchVerified: true,
    staleGenerationIsolationVerified: true,
    goldenCaseCount: goldenMatrix.caseCount,
    goldenCaseIds: Object.freeze([...goldenMatrix.caseIds]),
    goldenMatrixResultSha256: goldenMatrix.resultSha256,
    goldenResultSha256: sha256(stableStringify({ currentResult, staleResult, goldenMatrixResultSha256: goldenMatrix.resultSha256 })),
  });
}

export function captureGoldenSearchMatrix(databaseUrl) {
  const output = runPsqlScript(databaseUrl, readFileSync(GOLDEN_SQL, "utf8"));
  const cases = output.split(/\r?\n/u)
    .filter((line) => line.startsWith(GOLDEN_PREFIX))
    .map((line) => JSON.parse(line.slice(GOLDEN_PREFIX.length)));
  const byId = new Map();
  for (const entry of cases) {
    if (!entry || typeof entry.id !== "string" || byId.has(entry.id)) throw new Error("Runtime golden matrix emitted malformed or duplicate case evidence.");
    byId.set(entry.id, entry);
  }
  const ordered = REQUIRED_GOLDEN_SEARCH_CASE_IDS.map((id) => {
    const entry = byId.get(id);
    if (!entry) throw new Error(`Runtime golden matrix is missing required case ${id}.`);
    if (entry.passed !== true) throw new Error(`Runtime golden matrix case ${id} failed.`);
    return entry;
  });
  if (cases.length !== ordered.length) throw new Error("Runtime golden matrix emitted unexpected case evidence.");
  return Object.freeze({
    passed: true,
    caseCount: ordered.length,
    caseIds: Object.freeze(ordered.map((entry) => entry.id)),
    resultSha256: sha256(stableStringify(ordered)),
  });
}

export function captureSearchRuntimeEvidence(databaseUrl, headSha) {
  const pointer = runPsql(databaseUrl, "select coalesce(current_generation_id::text,'') from public.food_catalog_current_generation where singleton_key=true;");
  if (pointer !== CURRENT_GENERATION_ID) throw new Error(`Expected restored current generation ${CURRENT_GENERATION_ID}, observed ${pointer || "<null>"}.`);

  const staleRebuild = jsonQuery(databaseUrl, `select public.rebuild_food_catalog_search_projection_v2('${STALE_GENERATION_ID}'::uuid,'search-projection-v2',null)::text;`);
  const currentRebuild = jsonQuery(databaseUrl, `select public.rebuild_food_catalog_search_projection_v2('${CURRENT_GENERATION_ID}'::uuid,'search-projection-v2',null)::text;`);
  const currentResult = jsonQuery(databaseUrl, buildAuthenticatedSearchSql("public.search_food_catalog_v2('Plan7 Portable Chicken','en','Latn','DE',null,20,null,null,'all','{}'::jsonb)"));
  const staleResult = jsonQuery(databaseUrl, buildAuthenticatedSearchSql("public.search_food_catalog_v2('Plan7 Stale Turkey','en','Latn','GLOBAL',null,20,null,null,'all','{}'::jsonb)"));
  const counts = jsonQuery(databaseUrl, `select json_build_object(
    'current',(select count(*) from public.food_catalog_search_documents where generation_id='${CURRENT_GENERATION_ID}'::uuid),
    'stale',(select count(*) from public.food_catalog_search_documents where generation_id='${STALE_GENERATION_ID}'::uuid)
  )::text;`);
  const goldenMatrix = captureGoldenSearchMatrix(databaseUrl);
  return buildSearchRuntimeEvidence({
    headSha,
    currentGenerationId: pointer,
    currentResult,
    staleResult,
    currentRebuild,
    staleRebuild,
    documentCounts: counts,
    goldenMatrix,
  });
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    const next = () => {
      const nextValue = argv[++index];
      if (!nextValue) throw new Error(`${value} requires a value.`);
      return nextValue;
    };
    if (value === "--database-url") options.databaseUrl = next();
    else if (value === "--expected-head") options.expectedHead = next();
    else if (value === "--output") options.output = next();
    else throw new Error(`Unknown search runtime evidence argument ${value}.`);
  }
  if (!options.databaseUrl || !options.expectedHead || !options.output) throw new Error("--database-url, --expected-head and --output are required.");
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const evidence = captureSearchRuntimeEvidence(options.databaseUrl, options.expectedHead);
  await writeFile(resolve(options.output), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
