#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { verifyCanonicalPrePointerGeneration } from "../lib/food-catalog/portability/pre-pointer-generation-runtime.mjs";

const GENERATION_ID = "71000000-0000-4000-8000-000000000901";
const EVENT_ID = "71000000-0000-4000-8000-000000000921";
const REPORT_ID = "71000000-0000-4000-8000-000000000911";
const FOOD_ID = "71000000-0000-4000-8000-000000000101";
const SOURCE_ID = "71000000-0000-4000-8000-000000000201";
const CURRENT_ASSERTION_ID = "71000000-0000-4000-8000-000000000701";
const STALE_ASSERTION_ID = "71000000-0000-4000-8000-000000000703";
const ACTIVATION_SET_ID = "71000000-0000-4000-8000-000000000801";
const EXTRA_NAME_ID = "71000000-0000-4000-8000-0000000005f1";
const BLOCKING_FINDING_ID = "71000000-0000-4000-8000-0000000009f1";
const EXPECTED_CHECKSUM = "d46160821cd09ae8fa33809f915ce93e367a6c2cf04d3df9a4a3e0e96eb57cd6";

function runPsql(databaseUrl, sql, { tuplesOnly = false } = {}) {
  const args = [databaseUrl, "-X", "-v", "ON_ERROR_STOP=1"];
  if (tuplesOnly) args.push("-A", "-t");
  const result = spawnSync("psql", args, { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Plan7 adversarial SQL failed: ${(result.stderr ?? "").trim()}`);
  return (result.stdout ?? "").trim();
}

function pointerState(databaseUrl) {
  return runPsql(databaseUrl, `SELECT concat_ws('|',coalesce(current_generation_id::text,'NULL'),coalesce(current_event_id::text,'NULL'),coalesce(current_validation_report_id::text,'NULL'),pointer_revision::text,updated_at::text) FROM public.food_catalog_current_generation WHERE singleton_key;`, { tuplesOnly: true });
}

function assertPointer(databaseUrl, expected, label) {
  const actual = pointerState(databaseUrl);
  if (actual !== expected) throw new Error(`${label}: current-generation pointer changed unexpectedly: ${actual}`);
}

function triggerEnabled(databaseUrl, relation, trigger) {
  const result = runPsql(databaseUrl, `SELECT t.tgenabled='O' FROM pg_trigger t WHERE t.tgrelid='public.${relation}'::regclass AND t.tgname='${trigger}' AND NOT t.tgisinternal;`, { tuplesOnly: true });
  if (result !== "t") throw new Error(`Adversarial cleanup did not restore ${relation}.${trigger} to ordinary enabled mode.`);
}

function verifyFails(databaseUrl, expectedPattern, caseName) {
  try {
    verifyCanonicalPrePointerGeneration({
      databaseUrl,
      generationId: GENERATION_ID,
      eventId: EVENT_ID,
      reportId: REPORT_ID,
      expectedChecksum: EXPECTED_CHECKSUM,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!expectedPattern.test(message)) {
      throw new Error(`${caseName}: failed closed for an unexpected reason: ${message}`);
    }
    return message;
  }
  throw new Error(`${caseName}: corruption unexpectedly passed canonical pre-pointer validation.`);
}

function withCorruption({ databaseUrl, name, corruptSql, cleanupSql, expectedPattern, pointerBefore, triggerAssertions = [] }) {
  runPsql(databaseUrl, corruptSql);
  let failure;
  try {
    failure = verifyFails(databaseUrl, expectedPattern, name);
    assertPointer(databaseUrl, pointerBefore, `${name} failure`);
  } finally {
    runPsql(databaseUrl, cleanupSql);
  }
  assertPointer(databaseUrl, pointerBefore, `${name} cleanup`);
  for (const { relation, trigger } of triggerAssertions) triggerEnabled(databaseUrl, relation, trigger);
  return { name, blocked: true, pointerUnchanged: true, failure };
}

export function runPrePointerAdversarialProof(databaseUrl) {
  if (!databaseUrl) throw new Error("PLAN7_DATABASE_URL is required for the disposable adversarial proof.");

  const originalPointer = pointerState(databaseUrl);
  const parts = originalPointer.split("|");
  if (parts.length < 5 || parts[0] !== GENERATION_ID || parts[1] !== EVENT_ID || parts[2] !== REPORT_ID || parts[3] !== "1") {
    throw new Error(`Plan7 adversarial source pointer prerequisite is unexpected: ${originalPointer}`);
  }
  const originalUpdatedAt = parts.slice(4).join("|").replaceAll("'", "''");

  runPsql(databaseUrl, `UPDATE public.food_catalog_current_generation SET current_generation_id=NULL,current_event_id=NULL,current_validation_report_id=NULL,pointer_revision=0 WHERE singleton_key;`);
  const preRestorePointer = pointerState(databaseUrl);
  if (!preRestorePointer.startsWith("NULL|NULL|NULL|0|")) throw new Error(`Plan7 adversarial pre-restore pointer was not neutral: ${preRestorePointer}`);

  const results = [];
  try {
    results.push(withCorruption({
      databaseUrl,
      name: "composition",
      corruptSql: `
INSERT INTO public.food_names(id,food_id,language_tag,name_role,name_text,normalized_text,script_code,origin,source_record_id,policy_version,created_at)
VALUES('${EXTRA_NAME_ID}'::uuid,'${FOOD_ID}'::uuid,'en','search_alias','Plan7 Portable Poultry','plan7 portable poultry','Latn','curated','${SOURCE_ID}'::uuid,'plan7-fixture-v1','2026-09-10T18:15:30Z');
INSERT INTO public.food_catalog_generation_names(generation_id,food_id,name_fact_id)
VALUES('${GENERATION_ID}'::uuid,'${FOOD_ID}'::uuid,'${EXTRA_NAME_ID}'::uuid);`,
      cleanupSql: `
ALTER TABLE public.food_catalog_generation_names DISABLE TRIGGER food_catalog_generation_names_immutable;
DELETE FROM public.food_catalog_generation_names WHERE generation_id='${GENERATION_ID}'::uuid AND food_id='${FOOD_ID}'::uuid AND name_fact_id='${EXTRA_NAME_ID}'::uuid;
ALTER TABLE public.food_catalog_generation_names ENABLE TRIGGER food_catalog_generation_names_immutable;
ALTER TABLE public.food_names DISABLE TRIGGER food_names_immutable;
DELETE FROM public.food_names WHERE id='${EXTRA_NAME_ID}'::uuid;
ALTER TABLE public.food_names ENABLE TRIGGER food_names_immutable;`,
      expectedPattern: /GENERATION_CHECKSUM_MISMATCH|recomputed checksum/i,
      pointerBefore: preRestorePointer,
      triggerAssertions: [
        { relation: "food_catalog_generation_names", trigger: "food_catalog_generation_names_immutable" },
        { relation: "food_names", trigger: "food_names_immutable" },
      ],
    }));

    results.push(withCorruption({
      databaseUrl,
      name: "verification-selection",
      corruptSql: `
ALTER TABLE public.food_catalog_generation_verification DISABLE TRIGGER food_catalog_generation_verification_immutable;
ALTER TABLE public.food_catalog_generation_verification DROP CONSTRAINT food_catalog_generation_verification_same_food_fkey;
UPDATE public.food_catalog_generation_verification SET assertion_id='${STALE_ASSERTION_ID}'::uuid WHERE generation_id='${GENERATION_ID}'::uuid AND food_id='${FOOD_ID}'::uuid AND assertion_scope='identity';`,
      cleanupSql: `
UPDATE public.food_catalog_generation_verification SET assertion_id='${CURRENT_ASSERTION_ID}'::uuid WHERE generation_id='${GENERATION_ID}'::uuid AND food_id='${FOOD_ID}'::uuid AND assertion_scope='identity';
ALTER TABLE public.food_catalog_generation_verification ADD CONSTRAINT food_catalog_generation_verification_same_food_fkey FOREIGN KEY (assertion_id, food_id, assertion_scope) REFERENCES public.food_verification_assertions(id, food_id, assertion_scope) ON DELETE RESTRICT;
ALTER TABLE public.food_catalog_generation_verification ENABLE TRIGGER food_catalog_generation_verification_immutable;`,
      expectedPattern: /INVALID_VERIFICATION_SELECTION/i,
      pointerBefore: preRestorePointer,
      triggerAssertions: [{ relation: "food_catalog_generation_verification", trigger: "food_catalog_generation_verification_immutable" }],
    }));

    results.push(withCorruption({
      databaseUrl,
      name: "activation-authority",
      corruptSql: `
ALTER TABLE public.food_catalog_activation_sets DISABLE TRIGGER food_catalog_activation_sets_immutable;
UPDATE public.food_catalog_activation_sets SET activation_policy_version='plan7-corrupt-activation-v1' WHERE id='${ACTIVATION_SET_ID}'::uuid;`,
      cleanupSql: `
UPDATE public.food_catalog_activation_sets SET activation_policy_version='plan7-fixture-v1' WHERE id='${ACTIVATION_SET_ID}'::uuid;
ALTER TABLE public.food_catalog_activation_sets ENABLE TRIGGER food_catalog_activation_sets_immutable;`,
      expectedPattern: /ACTIVE_FOOD_MISSING_ACTIVATION_GRANT/i,
      pointerBefore: preRestorePointer,
      triggerAssertions: [{ relation: "food_catalog_activation_sets", trigger: "food_catalog_activation_sets_immutable" }],
    }));

    results.push(withCorruption({
      databaseUrl,
      name: "report-checksum-linkage",
      corruptSql: `
ALTER TABLE public.food_catalog_generation_validation_reports DISABLE TRIGGER food_catalog_generation_validation_reports_immutable;
UPDATE public.food_catalog_generation_validation_reports SET generation_checksum_sha256=repeat('0',64) WHERE id='${REPORT_ID}'::uuid;`,
      cleanupSql: `
UPDATE public.food_catalog_generation_validation_reports SET generation_checksum_sha256='${EXPECTED_CHECKSUM}' WHERE id='${REPORT_ID}'::uuid;
ALTER TABLE public.food_catalog_generation_validation_reports ENABLE TRIGGER food_catalog_generation_validation_reports_immutable;`,
      expectedPattern: /validation report linkage|generation_checksum|authority/i,
      pointerBefore: preRestorePointer,
      triggerAssertions: [{ relation: "food_catalog_generation_validation_reports", trigger: "food_catalog_generation_validation_reports_immutable" }],
    }));

    results.push(withCorruption({
      databaseUrl,
      name: "blocking-finding",
      corruptSql: `
INSERT INTO public.food_catalog_generation_validation_findings(id,report_id,finding_ordinal,reason_code,food_id,severity,blocking,evidence_reference,validator_policy_version,details,created_at)
VALUES('${BLOCKING_FINDING_ID}'::uuid,'${REPORT_ID}'::uuid,99,'PLAN7_ADVERSARIAL_BLOCKER','${FOOD_ID}'::uuid,'error',true,'fixture://plan7/adversarial','food-catalog-generation-validator-set-v1','{}'::jsonb,'2026-09-10T18:16:30Z');`,
      cleanupSql: `
ALTER TABLE public.food_catalog_generation_validation_findings DISABLE TRIGGER food_catalog_generation_validation_findings_immutable;
DELETE FROM public.food_catalog_generation_validation_findings WHERE id='${BLOCKING_FINDING_ID}'::uuid;
ALTER TABLE public.food_catalog_generation_validation_findings ENABLE TRIGGER food_catalog_generation_validation_findings_immutable;`,
      expectedPattern: /stored validation findings contain blockers|blocker/i,
      pointerBefore: preRestorePointer,
      triggerAssertions: [{ relation: "food_catalog_generation_validation_findings", trigger: "food_catalog_generation_validation_findings_immutable" }],
    }));

    const clean = verifyCanonicalPrePointerGeneration({
      databaseUrl,
      generationId: GENERATION_ID,
      eventId: EVENT_ID,
      reportId: REPORT_ID,
      expectedChecksum: EXPECTED_CHECKSUM,
    });
    if (!clean.verified || clean.recomputedChecksum !== EXPECTED_CHECKSUM || clean.blockerCount !== 0) {
      throw new Error("Plan7 adversarial cleanup did not restore canonical pre-pointer validity.");
    }
    assertPointer(databaseUrl, preRestorePointer, "clean canonical verification");
  } finally {
    runPsql(databaseUrl, `UPDATE public.food_catalog_current_generation SET current_generation_id='${GENERATION_ID}'::uuid,current_event_id='${EVENT_ID}'::uuid,current_validation_report_id='${REPORT_ID}'::uuid,pointer_revision=1,updated_at='${originalUpdatedAt}'::timestamptz WHERE singleton_key;`);
  }

  assertPointer(databaseUrl, originalPointer, "adversarial harness final restoration");
  return Object.freeze({
    format: "plaivra-food-catalog-plan7-pre-pointer-adversarial",
    version: 1,
    canonicalChecksumSha256: EXPECTED_CHECKSUM,
    preRestorePointerUnchangedAcrossFailures: results.every((entry) => entry.pointerUnchanged),
    corruptionCases: Object.freeze(results),
    finalSourcePointerRestored: true,
  });
}

const databaseUrl = process.env.PLAN7_DATABASE_URL;
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.stdout.write(`${JSON.stringify(runPrePointerAdversarialProof(databaseUrl))}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
