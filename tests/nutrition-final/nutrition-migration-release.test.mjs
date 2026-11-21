/** Nutrition-only immutable migration/source lineage checks. No hosted DB. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync,readFileSync,statSync } from "node:fs";
import { test } from "node:test";
import { resolve } from "node:path";

const shaPattern=/^[a-f0-9]{40}$/;
// Official USDA archives can be large; external hashing avoids a huge in-memory Buffer.
function verifyOriginalArchive(path, expectedBytes, expectedSha256){
  const stat=statSync(path);
  assert.equal(stat.isFile(),true,"Source archive must be a regular file");
  assert.equal(stat.size,expectedBytes,"Original source bytes differ");
  const stdout=execFileSync("sha256sum",["--",path],{
    encoding:"utf8",timeout:5*60*1000,maxBuffer:1024*1024
  });
  assert.equal(stdout.slice(0,64),expectedSha256,"Original source archive SHA256 differs");
}
function git(...args){return execFileSync("git",args,{encoding:"utf8",timeout:20000}).trim()}
function reviewed(){
  const base=process.env.NUTRITION_QA_APPROVAL_BASE;
  const sha=process.env.NUTRITION_QA_APPROVAL_SHA;
  if(!shaPattern.test(base??"")||!shaPattern.test(sha??""))throw Error("Missing exact reviewed/base release identities");
  assert.equal(git("rev-parse","HEAD"),sha);
  return {base,sha};
}
test("exact candidate Git tree retains every already-applied migration byte",()=>{
  const {base}=reviewed();
  const records=git("ls-tree","-r",base,"supabase/migrations").split("\n");
  assert.ok(records.length>=133,"expected applied baseline");
  for(const entry of records){
    const [,blob,file]=entry.match(/^100644 blob ([0-9a-f]{40})\t(.+)$/)||[];
    assert.ok(blob&&file,"malformed baseline migration tree");
    assert.equal(git("rev-parse","HEAD:"+file),blob,"immutable migration changed: "+file);
  }
});
test("current migration-ledger validator reports reconciled source evidence",()=>{
  execFileSync(process.execPath,["scripts/check-migration-ledger.mjs"],{
    encoding:"utf8",timeout:60000,stdio:"pipe"
  });
});
test("original locked Foundation ZIP has exact unchanged source bytes and SHA",()=>{
  const lock=JSON.parse(readFileSync("data/food-catalog/source-locks/usda-foundation-2026-04.json","utf8"));
  const archivePath=process.env.NUTRITION_FOUNDATION_ARCHIVE_PATH;
  if(!archivePath||!existsSync(archivePath))throw Error("Missing exact original USDA Foundation source archive; cannot approve");
  verifyOriginalArchive(archivePath,lock.sourceBytes,lock.sourceChecksumSha256);
});
test("Plan10 FNDDS original source lock and bytes are mandatory, not inferred",()=>{
  const lockFile="data/food-catalog/source-locks/usda-fndds-2024-10.json";
  assert.ok(existsSync(lockFile),"G-09 original FNDDS source lock missing");
  const lock=JSON.parse(readFileSync(lockFile,"utf8"));
  assert.equal(lock.dataset,"FNDDS");
  const original=process.env.NUTRITION_FNDDS_ARCHIVE_PATH;
  assert.ok(original&&existsSync(original),"FNDDS original source bytes missing");
  assert.ok(Number.isSafeInteger(lock.sourceBytes)&&lock.sourceBytes>0);
  assert.match(lock.sourceChecksumSha256,/^[a-f0-9]{64}$/);
  verifyOriginalArchive(original,lock.sourceBytes,lock.sourceChecksumSha256);
});


// Exact release-integrity runtime files must remain byte-identical to the
// released baseline until separately approved PR #189 disposition (G-01).
test("Nutrition candidate preserves current Production release integrity runtimes",()=>{
  const {base}=reviewed();
  const protectedPaths=[
    "scripts/create-release-manifest.mjs",
    "scripts/release-preflight.mjs",
    "scripts/quality-evidence-contract.mjs",
    "scripts/verify-built-release-metadata.mjs",
    "scripts/check-migration-ledger.mjs",
    ".github/workflows/release-preflight.yml"
  ];
  for(const file of protectedPaths){
    const previous=git("rev-parse",base+":"+file);
    const current=git("rev-parse","HEAD:"+file);
    assert.equal(current,previous,
      "Release-critical source was edited without separate approved disposition: "+file);
  }
});
test("original Foundation source lock has exact immutable release and hex evidence",()=>{
  const path="data/food-catalog/source-locks/usda-foundation-2026-04.json";
  const lock=JSON.parse(readFileSync(path,"utf8"));
  assert.equal(lock.provider,"USDA_FDC");
  assert.equal(lock.dataset,"FoundationFoods");
  assert.equal(lock.sourceVersion,"2026-04-30");
  assert.equal(lock.sourceFilename,"FoodData_Central_foundation_food_json_2026-04-30.zip");
  assert.equal(new URL(lock.sourceUrl).protocol,"https:");
  assert.match(lock.sourceChecksumSha256,/^[a-f0-9]{64}$/);
  assert.match(lock.configChecksumSha256,/^[a-f0-9]{64}$/);
  assert.ok(Number.isSafeInteger(lock.sourceBytes)&&lock.sourceBytes>0);
  assert.equal(lock.productionAuthority,false,"Research lock cannot grant Production authority");
});
test("Nutrition QA does not silently reintroduce legacy app-wide tracked tests",()=>{
  const tracked=git("ls-files").split("\n").filter(Boolean);
  const knownCases=tracked.filter(path=>/(\.test\.|\.spec\.)[cm]?[jt]sx?$/.test(path));
  assert.ok(knownCases.length>=7,"Required final Nutrition suites missing");
  const unexpected=knownCases.filter(path=>
    !/^tests\/nutrition-final\/[^/]+\.test\.mjs$/.test(path));
  assert.deepEqual(unexpected,[],"Legacy non-Nutrition QA files reintroduced");
  const scoped=tracked.filter(path=>/^tests\/nutrition-final\/[^/]+\.test\.mjs$/.test(path));
  assert.equal(scoped.length,7);
});
