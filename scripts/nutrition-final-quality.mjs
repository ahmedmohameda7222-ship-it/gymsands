/**
 * Nutrition-only QA orchestrator. Every required group must exist and pass.
 * Never invokes old app-wide tests or writes to Production.
 */
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve, relative, sep, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
// Required minimum assertions, not just an exit status from an empty test file.
const groups=Object.freeze({
  "food-catalog-source": {file:"tests/nutrition-final/food-catalog-source.test.mjs",minTests:25},
  "governance-ingestion": {file:"tests/nutrition-final/governance-ingestion.test.mjs",minTests:18},
  "activation-generation-search": {file:"tests/nutrition-final/activation-generation-search.test.mjs",minTests:32},
  "nutrition-consumers": {file:"tests/nutrition-final/nutrition-consumers.test.mjs",minTests:53},
  "nutrition-privacy-mcp": {file:"tests/nutrition-final/nutrition-privacy-mcp.test.mjs",minTests:28},
  "nutrition-browser-locale": {file:"tests/nutrition-final/nutrition-browser-locale.test.mjs",minTests:19},
  "nutrition-migration-release": {file:"tests/nutrition-final/nutrition-migration-release.test.mjs",minTests:7}
});
const shaPattern=/^[a-f0-9]{40}$/;
function readOptions(argv){
  const opts={};
  for(let i=0;i<argv.length;i+=2){
    const arg=argv[i], value=argv[i+1];
    if(!["--reviewed-commit","--comparison-base","--output"].includes(arg) ||
        !value || value.startsWith("--") || opts[arg]) throw Error("Invalid QA argument: "+arg);
    opts[arg]=value;
  }
  for(const key of ["--reviewed-commit","--comparison-base","--output"]){
    if(!opts[key]) throw Error("Missing "+key);
  }
  return opts;
}
const sh=(args)=>execFileSync("git",args,{cwd:root,encoding:"utf8"}).trim();
const hash=(buffer)=>createHash("sha256").update(buffer).digest("hex");
// Immutable artifact digest covers all source-lock, file and test-result evidence.
function writeManifest(output,value){
  const bytes=Buffer.from(JSON.stringify(value,null,2)+"\n","utf8");
  writeFileSync(join(output,"nutrition-qa-manifest.json"),bytes);
  writeFileSync(join(output,"nutrition-qa-manifest.sha256"),hash(bytes)+"  nutrition-qa-manifest.json\n","utf8");
}
const sourceDigest=(path)=>existsSync(resolve(root,path))?hash(readFileSync(resolve(root,path))):null;
const fileEvidence=(path)=> {
  const absolute=resolve(root,path);
  if(!existsSync(absolute))return {path,exists:false,sha256:null,bytes:null};
  const bytes=readFileSync(absolute);
  return {path,exists:true,sha256:hash(bytes),bytes:bytes.length};
};
function archiveEvidence(envKey){
  const path=process.env[envKey]??null;
  if(!path||!existsSync(path))return {sourceEnv:envKey,exists:false,sha256:null,bytes:null};
  // Original USDA archives can be large. Stream through the runner's GNU
  // sha256sum executable instead of buffering entire ZIPs into Node memory.
  const info=statSync(path);
  if(!info.isFile())throw Error("USDA source evidence must be a regular file");
  const output=execFileSync("sha256sum",["--",path],{
    encoding:"utf8",timeout:5*60*1000,maxBuffer:1024*1024
  });
  const sha256=output.slice(0,64);
  if(!/^[a-f0-9]{64}$/.test(sha256))throw Error("Malformed USDA SHA256 evidence");
  return {sourceEnv:envKey,exists:true,sha256,bytes:info.size};
}
function browserEvidence(outputRelative){
  const paths=[];
  for(const locale of ["en","de","ar"]){
    for(const state of ["empty","populated"]){
      for(const width of ["mobile","desktop"]){
        paths.push(join(outputRelative,"browser",
          "food-"+width+"-"+locale+"-"+state+".png"));
      }
    }
  }
  return paths.map(fileEvidence);
}
// A matching Git HEAD does not prove the filesystem matches that commit.
function inspectReviewedSourceTree(){
  const diff=spawnSync("git",["diff","--quiet","HEAD","--"],{cwd:root,encoding:"utf8"});
  const trackedClean=diff.status===0&&!diff.error;
  const paths=sh(["ls-files","--others","--exclude-standard","--",
    ".github","app","components","data","lib","scripts","services",
    "supabase/migrations","tests"]);
  const unexpectedSourcePaths=paths?paths.split("\n").filter(Boolean):[];
  return {trackedClean,unexpectedSourcePaths,
    valid:trackedClean&&unexpectedSourcePaths.length===0};
}
function main(){
  const options=readOptions(process.argv.slice(2));
  const reviewed=options["--reviewed-commit"];
  const base=options["--comparison-base"];
  if(!shaPattern.test(reviewed)||!shaPattern.test(base))throw Error("Invalid exact SHA");
  const current=sh(["rev-parse","HEAD"]);
  if(current!==reviewed)throw Error("Checked-out HEAD does not equal reviewed commit");
  sh(["cat-file","-e",base+"^{commit}"]);
  const ancestry=spawnSync("git",["merge-base","--is-ancestor",base,reviewed],{cwd:root});
  if(ancestry.status!==0)throw Error("Comparison base is not an ancestor");
  if(process.env.GITHUB_REPOSITORY && process.env.GITHUB_REPOSITORY!=="ahmedmohameda7222-ship-it/gymsands")throw Error("Wrong repository");
  // A PR label alone is not G-11 authority; require separate identity-bound owner approval.
  if(process.env.NUTRITION_QA_APPROVED!=="true" ||
     process.env.NUTRITION_QA_APPROVAL_SHA!==reviewed ||
     process.env.NUTRITION_QA_APPROVAL_BASE!==base)throw Error("Exact Nutrition QA owner/Planner approval missing");

  const output=resolve(root,options["--output"]);
  const relativeOutput=relative(root,output);
  if(relativeOutput===""||relativeOutput.startsWith(".."+sep)||
     relativeOutput===".."||relativeOutput.startsWith(sep)||
     !(relativeOutput==="nutrition-quality-reports" ||
       relativeOutput.startsWith("nutrition-quality-reports"+sep))){
    throw Error("QA output must be under nutrition-quality-reports, never app source");
  }
  mkdirSync(output,{recursive:true});
  const absent=Object.values(groups).filter(({file})=>!existsSync(resolve(root,file))).map(({file})=>file);
  const state={schemaVersion:1,repository:"ahmedmohameda7222-ship-it/gymsands",
    reviewedCommit:reviewed,comparisonBase:base,runId:process.env.GITHUB_RUN_ID||null,
    runAttempt:process.env.GITHUB_RUN_ATTEMPT||null,
    generatedAt:new Date().toISOString(),scope:"nutrition-only",
    checkedOutTreeSha:sh(["rev-parse","HEAD^{tree}"]),
    evidenceInputs:{
      testSources:Object.values(groups).map(({file})=>({path:file,sha256:sourceDigest(file)})),
      runnerSha256:sourceDigest("scripts/nutrition-final-quality.mjs"),
      workflowSha256:sourceDigest(".github/workflows/nutrition-final-quality.yml"),
      sourceLocks:[
        "data/food-catalog/source-locks/usda-foundation-2026-04.json",
        "data/food-catalog/source-locks/usda-fndds-2024-10.json"
      ].map(path=>({path,sha256:sourceDigest(path)})),
      migrationLedgerSha256:sourceDigest("supabase/migration-ledger.json")
    },
    scopeCaveats:{
      browserUsesSyntheticMockAuth:true,
      provesLiveOwnerSessionAuthorization:false,
      provesActualPublishedCatalogGeneration:false,
      provesExactReleaseCanonicalQuality:false,
      productionReleaseEligible:false
    },
    groups:[],missing:absent,result:"BLOCKED",
    reviewedSourceIntegrity:{before:inspectReviewedSourceTree(),after:null}};
  if(!state.reviewedSourceIntegrity.before.valid){
    writeManifest(output,state);
    throw Error("Reviewed Nutrition source tree is dirty before QA execution");
  }
  if(absent.length){
    writeManifest(output,state);
    throw Error("Required Nutrition test groups not implemented: "+absent.join(", "));
  }

  let failures=0;
  for(const [name,{file,minTests}] of Object.entries(groups)){
    // "node --test" invokes only the new Nutrition-only cases.
    const argv=["--test",file];
    const run=spawnSync(process.execPath,argv,{cwd:root,encoding:"utf8",
      timeout:20*60*1000,maxBuffer:32*1024*1024,env:{...process.env,NUTRITION_QA_OFFLINE:"true"}});
    const log=String(run.stdout||"")+String(run.stderr||"")+(run.error?"\n"+String(run.error):"");
    const tapCount=Number(log.match(/^# tests ([0-9]+)$/m)?.[1]??NaN);
    const tapPass=Number(log.match(/^# pass ([0-9]+)$/m)?.[1]??NaN);
    const tapFail=Number(log.match(/^# fail ([0-9]+)$/m)?.[1]??NaN);
    const tapSkipped=Number(log.match(/^# skipped ([0-9]+)$/m)?.[1]??NaN);
    const coverageVerified=Number.isSafeInteger(tapCount)&&tapCount>=minTests
      && tapPass===tapCount&&tapFail===0&&tapSkipped===0;
    // Even an exit-zero test file is a failure if it ran fewer than the scoped cases.
    const exit=Number.isInteger(run.status)&&run.status===0&&coverageVerified?0:1;
    const logName=name+".log";
    const bytes=Buffer.from(log);
    writeFileSync(join(output,logName),bytes);
    writeFileSync(join(output,name+".exit"),String(exit)+"\n");
    state.groups.push({name,command:[process.execPath,...argv],exitCode:exit,
      log:logName,logSha256:hash(bytes),bytes:bytes.length,
      observedTests:Number.isSafeInteger(tapCount)?tapCount:null,
      requiredMinimumTests:minTests,passedTests:Number.isSafeInteger(tapPass)?tapPass:null,
      skippedTests:Number.isSafeInteger(tapSkipped)?tapSkipped:null,
      timedOut:!!run.error&&run.error.code==="ETIMEDOUT"});
    if(exit!==0)failures++;
    process.stdout.write(name+": "+(exit===0?"PASS":"FAIL")+" ("+exit+")\n");
  }
  const outputRelative=relative(root,output);
  const externalArtifacts=[
    fileEvidence(join(outputRelative,"identity.txt")),
    fileEvidence(join(outputRelative,"migration-replay.log")),
    fileEvidence(join(outputRelative,"browser-devserver.log")),
    fileEvidence(join(outputRelative,"browser-fixtures","manifest.json"))
  ];
  const screenshots=browserEvidence(outputRelative);
  const archives=[
    archiveEvidence("NUTRITION_FOUNDATION_ARCHIVE_PATH"),
    archiveEvidence("NUTRITION_FNDDS_ARCHIVE_PATH")
  ];
  const mandatoryArtifactMissing=externalArtifacts
    .filter(item=>!item.exists).map(item=>item.path);
  const missingScreenshots=screenshots.filter(item=>!item.exists).map(item=>item.path);
  const missingFoundation=archives[0].exists!==true;
  const missingFndds=archives[1].exists!==true;
  state.externalEvidence={files:externalArtifacts,screenshots,archives};
  state.reviewedSourceIntegrity.after=inspectReviewedSourceTree();
  if(!state.reviewedSourceIntegrity.after.valid)failures++;
  state.missingRequiredEvidence=[
    ...mandatoryArtifactMissing,...missingScreenshots,
    ...(missingFoundation?["NUTRITION_FOUNDATION_ARCHIVE_PATH"]:[]),
    ...(missingFndds?["NUTRITION_FNDDS_ARCHIVE_PATH"]:[])
  ];
  if(state.missingRequiredEvidence.length)failures++;
  state.result=failures===0?"PASS":"FAIL";
  state.failureCount=failures;
  writeManifest(output,state);
  if(failures!==0)throw Error(failures+
    " Nutrition QA group(s)/evidence gate(s) failed");
}
try{main()}catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}
