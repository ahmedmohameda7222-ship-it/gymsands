/**
 * Nutrition-only QA orchestrator. Every required group must exist and pass.
 * Never invokes old app-wide tests or writes to Production.
 */
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, relative, sep, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const groups=Object.freeze({
  "food-catalog-source":"tests/nutrition-final/food-catalog-source.test.mjs",
  "governance-ingestion":"tests/nutrition-final/governance-ingestion.test.mjs",
  "activation-generation-search":"tests/nutrition-final/activation-generation-search.test.mjs",
  "nutrition-consumers":"tests/nutrition-final/nutrition-consumers.test.mjs",
  "nutrition-privacy-mcp":"tests/nutrition-final/nutrition-privacy-mcp.test.mjs",
  "nutrition-browser-locale":"tests/nutrition-final/nutrition-browser-locale.test.mjs",
  "nutrition-migration-release":"tests/nutrition-final/nutrition-migration-release.test.mjs"
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
function writeJson(p,value){writeFileSync(p,JSON.stringify(value,null,2)+"\n","utf8");}
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
     !relativeOutput.startsWith("nutrition-quality-reports")){
    throw Error("QA output must be under nutrition-quality-reports, never app source");
  }
  mkdirSync(output,{recursive:true});
  const absent=Object.values(groups).filter(file=>!existsSync(resolve(root,file)));
  const state={schemaVersion:1,repository:"ahmedmohameda7222-ship-it/gymsands",
    reviewedCommit:reviewed,comparisonBase:base,runId:process.env.GITHUB_RUN_ID||null,
    runAttempt:process.env.GITHUB_RUN_ATTEMPT||null,
    generatedAt:new Date().toISOString(),scope:"nutrition-only",groups:[],missing:absent,
    result:"BLOCKED"};
  if(absent.length){
    writeJson(join(output,"nutrition-qa-manifest.json"),state);
    throw Error("Required Nutrition test groups not implemented: "+absent.join(", "));
  }

  let failures=0;
  for(const [name,file] of Object.entries(groups)){
    // "node --test" invokes only the new Nutrition-only cases.
    const argv=["--test",file];
    const run=spawnSync(process.execPath,argv,{cwd:root,encoding:"utf8",
      timeout:20*60*1000,maxBuffer:32*1024*1024,env:{...process.env,NUTRITION_QA_OFFLINE:"true"}});
    const log=String(run.stdout||"")+String(run.stderr||"")+(run.error?"\n"+String(run.error):"");
    const exit=Number.isInteger(run.status)?run.status:1;
    const logName=name+".log";
    const bytes=Buffer.from(log);
    writeFileSync(join(output,logName),bytes);
    writeFileSync(join(output,name+".exit"),String(exit)+"\n");
    state.groups.push({name,command:[process.execPath,...argv],exitCode:exit,
      log:logName,logSha256:hash(bytes),bytes:bytes.length,
      timedOut:!!run.error&&run.error.code==="ETIMEDOUT"});
    if(exit!==0)failures++;
    process.stdout.write(name+": "+(exit===0?"PASS":"FAIL")+" ("+exit+")\n");
  }
  state.result=failures===0?"PASS":"FAIL";
  state.failureCount=failures;
  writeJson(join(output,"nutrition-qa-manifest.json"),state);
  if(failures!==0)throw Error(failures+" Nutrition QA group(s) failed");
}
try{main()}catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}
