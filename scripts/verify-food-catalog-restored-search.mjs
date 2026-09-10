#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildRestoredSearchVerificationPlan,
  verifyGoldenSearchMatrix,
  verifySearchRestorePreconditions,
} from "../lib/food-catalog/portability/search-restore-verifier.ts";

function stableJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return "null";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function jsonbLiteral(value) {
  return `${sqlLiteral(stableJson(value ?? {}))}::jsonb`;
}

function normalizeQueryCase(entry) {
  return {
    id: entry.id,
    query: entry.query ?? "",
    languageTag: entry.languageTag ?? "en",
    scriptCode: entry.scriptCode ?? null,
    marketScopeCode: entry.marketScopeCode ?? null,
    cursor: entry.cursor ?? null,
    limit: entry.limit ?? 20,
    category: entry.category ?? null,
    cuisine: entry.cuisine ?? null,
    scope: entry.scope ?? "all",
    filters: entry.filters ?? {},
  };
}

export function buildRestoredSearchSql(fixture) {
  const queryCases = (fixture.queryCases ?? []).map(normalizeQueryCase);
  const plan = buildRestoredSearchVerificationPlan({
    profile: "FULL_DR",
    currentGenerationId: fixture.currentGenerationId ?? null,
    restoredGenerationId: fixture.restoredGenerationId,
    projectionVersion: fixture.projectionVersion,
    nutritionPolicyVersion: fixture.nutritionPolicyVersion ?? null,
    queryCases,
  });

  const lines = [
    "\\set ON_ERROR_STOP on",
    "begin;",
    "do $plan7$",
    "begin",
    `  if (select current_generation_id from public.food_catalog_current_generation where singleton_key) is distinct from ${sqlLiteral(fixture.restoredGenerationId)}::uuid then`,
    "    raise exception 'Plan 7 restored search current-generation pointer mismatch.';",
    "  end if;",
    "end",
    "$plan7$;",
  ];

  for (const step of plan) {
    if (step.kind === "REBUILD") {
      lines.push(
        `select public.rebuild_food_catalog_search_projection_v2(${sqlLiteral(step.generationId)}::uuid, ${sqlLiteral(step.projectionVersion)}, ${sqlLiteral(step.nutritionPolicyVersion)});`,
      );
      continue;
    }
    const query = step.query;
    lines.push(
      `select jsonb_build_object('caseId', ${sqlLiteral(step.caseId)}, 'result', public.search_food_catalog_v2(${sqlLiteral(query.query)}, ${sqlLiteral(query.languageTag)}, ${sqlLiteral(query.scriptCode)}, ${sqlLiteral(query.marketScopeCode)}, ${sqlLiteral(query.cursor ?? null)}, ${query.limit}, ${sqlLiteral(query.category)}, ${sqlLiteral(query.cuisine)}, ${sqlLiteral(query.scope)}, ${jsonbLiteral(query.filters)}));`,
    );
  }
  lines.push("rollback;");
  return `${lines.join("\n")}\n`;
}

function assertHeadSha(value, label) {
  if (typeof value !== "string" || !/^[0-9a-f]{40}$/iu.test(value)) throw new Error(`${label} must be a 40-character Git SHA.`);
}

function assertFixtureShape(fixture) {
  if (fixture?.fixtureVersion !== 1) throw new Error("Unsupported Plan 7 golden search fixture version.");
  if (fixture.providerNetworkUsed !== false) throw new Error("Provider network use is forbidden in deterministic Plan 7 search evidence.");
  const populated = fixture.datasets?.populated;
  const zeroRow = fixture.datasets?.zeroRow;
  if (!populated || !Array.isArray(populated.foodIds) || populated.foodIds.length === 0) {
    throw new Error("Deterministic populated search fixture is missing.");
  }
  if (!zeroRow || !Array.isArray(zeroRow.foodIds) || zeroRow.foodIds.length !== 0) {
    throw new Error("Deterministic zero-row search fixture is missing or non-empty.");
  }
  if (typeof populated.fixedTimestamp !== "string" || !Number.isFinite(Date.parse(populated.fixedTimestamp))) {
    throw new Error("Populated search fixture requires a fixed timestamp.");
  }
}

export function verifyRestoredSearchFixture({ fixture, profile, expectedHeadSha, actualHeadSha }) {
  if (profile !== "CORE_PORTABLE" && profile !== "FULL_DR") throw new Error("Unsupported Plan 7 search evidence profile.");
  assertHeadSha(expectedHeadSha, "Expected head SHA");
  assertHeadSha(actualHeadSha, "Actual head SHA");
  if (expectedHeadSha !== actualHeadSha) throw new Error("Exact-head verification failed for Plan 7 restored search evidence.");
  assertFixtureShape(fixture);
  verifySearchRestorePreconditions(fixture.preconditions);

  const queryCases = (fixture.queryCases ?? []).map(normalizeQueryCase);
  buildRestoredSearchVerificationPlan({
    profile,
    currentGenerationId: fixture.currentGenerationId ?? null,
    restoredGenerationId: fixture.restoredGenerationId,
    projectionVersion: fixture.projectionVersion,
    nutritionPolicyVersion: fixture.nutritionPolicyVersion ?? null,
    queryCases,
  });
  const matrix = verifyGoldenSearchMatrix(fixture.queryCases ?? []);
  const protectedFixtureVerified = fixture.protectedFixtureVerified === true;
  const fixtureSha256 = sha256(stableJson(fixture));
  const goldenResultSha256 = sha256(stableJson((fixture.queryCases ?? []).map((entry) => ({ id: entry.id, actual: entry.actual }))));

  return Object.freeze({
    evidenceVersion: 1,
    profile,
    headSha: actualHeadSha,
    exactHeadVerified: true,
    fixtureSha256,
    goldenResultSha256,
    goldenSearchVerified: matrix.passed,
    goldenCaseCount: matrix.caseCount,
    populatedFixtureVerified: true,
    zeroRowFixtureVerified: true,
    protectedFixtureVerified,
    providerNetworkUsed: false,
    rebuildFunction: "public.rebuild_food_catalog_search_projection_v2(uuid,text,text)",
    searchFunction: "public.search_food_catalog_v2(text,text,text,text,text,integer,text,text,text,jsonb)",
    currentGenerationIdSha256: sha256(fixture.currentGenerationId),
    drReady: profile === "FULL_DR" && protectedFixtureVerified && matrix.passed,
    productionMutationPerformed: false,
    retirementAuthorized: false,
  });
}

function parseArguments(argv) {
  const args = { fixture: null, profile: null, expectedHead: null, actualHead: null, emitSql: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--fixture") args.fixture = argv[++index] ?? null;
    else if (token === "--profile") args.profile = argv[++index] ?? null;
    else if (token === "--expected-head") args.expectedHead = argv[++index] ?? null;
    else if (token === "--actual-head") args.actualHead = argv[++index] ?? null;
    else if (token === "--emit-sql") args.emitSql = true;
    else throw new Error(`Unknown argument: ${token}`);
  }
  if (!args.fixture) throw new Error("--fixture is required.");
  if (!args.emitSql && (!args.profile || !args.expectedHead || !args.actualHead)) {
    throw new Error("--profile, --expected-head and --actual-head are required for evidence generation.");
  }
  return args;
}

function main() {
  const args = parseArguments(process.argv.slice(2));
  const fixture = JSON.parse(readFileSync(resolve(args.fixture), "utf8"));
  if (args.emitSql) {
    process.stdout.write(buildRestoredSearchSql(fixture));
    return;
  }
  const evidence = verifyRestoredSearchFixture({
    fixture,
    profile: args.profile,
    expectedHeadSha: args.expectedHead,
    actualHeadSha: args.actualHead,
  });
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
