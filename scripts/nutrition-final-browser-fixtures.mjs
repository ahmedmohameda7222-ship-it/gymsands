/**
 * N107 UI-only synthetic browser fixtures. No actual account, JWT or Food
 * Catalog data is constructed. This must NOT be used as RLS/API evidence.
 * Always paired with localhost-only NEXT_PUBLIC_USE_MOCK_AUTH dev server.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const base=process.env.NUTRITION_E2E_BASE_URL??"http://127.0.0.1:3000";
const url=new URL(base);
if(url.protocol!=="http:" ||
  !["127.0.0.1","localhost","[::1]"].includes(url.hostname) ||
  url.port!=="3000" || url.pathname!=="/" ||
  url.username || url.password || url.search || url.hash){
  throw new Error("Nutrition UI fixtures only permit http://127.0.0.1:3000/");
}
const folder=resolve(root,"nutrition-quality-reports/browser-fixtures");
mkdirSync(folder,{recursive:true});
const languages=["en","de","ar"];
const kinds=["empty","populated"];
const records=[];
for(const language of languages){
  for(const kind of kinds){
    const key="NUTRITION_E2E_"+language.toUpperCase()+"_"+kind.toUpperCase()+"_STORAGE";
    const path=join(folder,language+"-"+kind+".json");
    const data={
      cookies:[{
        name:"plaivra.language.v1",value:language,domain:url.hostname,
        path:"/",expires:-1,httpOnly:false,secure:false,sameSite:"Lax"
      }],
      origins:[{origin:url.origin,localStorage:[
        {name:"plaivra.language.v1",value:language}
      ]}]
    };
    writeFileSync(path,JSON.stringify(data,null,2)+"\n","utf8");
    records.push({key,path,locale:language,kind,fixtureType:"UI_MOCK_ONLY"});
    process.stdout.write(key+"="+path+"\n");
  }
}
writeFileSync(join(folder,"manifest.json"),JSON.stringify({
  schemaVersion:1,origin:url.origin,identityMode:"APP_RENDERED_QA_MOCK",
  provesRealAuthenticatedOwnership:false,records
},null,2)+"\n");
