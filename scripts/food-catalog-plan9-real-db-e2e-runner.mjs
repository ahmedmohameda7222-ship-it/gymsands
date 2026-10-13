/** Disposable-only full Plan 9 real-database test launcher. */
import {createServer} from "vite";
import {resolve} from "node:path";
const server=await createServer({
 configFile:false,appType:"custom",server:{middlewareMode:true},logLevel:"error",
 resolve:{alias:[
  {find:"server-only",replacement:resolve("scripts/food-catalog-plan9-server-only-noop.mjs")},
  {find:"@",replacement:process.cwd()}
 ]}
});
try{
 const mod=await server.ssrLoadModule("/scripts/food-catalog-plan9-real-db-e2e.ts");
 await mod.run();
}finally{await server.close();}
