/** Nutrition-only privacy/permission contract tests; no network or user data. */
import assert from "node:assert/strict";
import { after,test } from "node:test";
import { createServer } from "vite";
const vite=await createServer({configFile:false,server:{middlewareMode:true},
  appType:"custom",logLevel:"error"});
after(async()=>vite.close());
const {
  MCP_SCOPES,MCP_PUBLIC_OAUTH_SCOPES,MCP_DEFAULT_SCOPES,MCP_RECIPE_SCOPES,
  hasScope,expandMcpScopes,migrateLegacyScopes,resolveSavedAiPermissionScopes
}=await vite.ssrLoadModule("/lib/mcp/scopes.ts");
const {ACCOUNT_DELETION_CONFIRMATION,RECENT_REAUTHENTICATION_MS}=
  await vite.ssrLoadModule("/lib/privacy/deletion-contract.ts");
test("anonymous default has zero implicit OAuth scopes",()=>{
  assert.deepEqual([...MCP_DEFAULT_SCOPES],[]);
  assert.equal(hasScope([],MCP_SCOPES.nutritionRead),false);
});
test("public OAuth cannot discover admin or legacy blanket scope",()=>{
  assert.ok(!MCP_PUBLIC_OAUTH_SCOPES.includes(MCP_SCOPES.admin));
  assert.ok(!MCP_PUBLIC_OAUTH_SCOPES.includes(MCP_SCOPES.all));
});
test("Nutrition write implies Nutrition read but never Train/workout read",()=>{
  const scopes=expandMcpScopes([MCP_SCOPES.nutritionWrite]);
  assert.ok(scopes.includes(MCP_SCOPES.nutritionRead));
  assert.ok(!scopes.includes(MCP_SCOPES.workoutsRead));
});
test("Nutrition permission never authorizes Recipe publishing by MCP",()=>{
  assert.equal(MCP_RECIPE_SCOPES.read,MCP_SCOPES.nutritionRead);
  assert.equal(MCP_RECIPE_SCOPES.writeDraft,MCP_SCOPES.nutritionWrite);
  assert.ok(!Object.hasOwn(MCP_RECIPE_SCOPES,"publish"));
});
test("legacy blanket or admin scopes cannot prove saved explicit consent",()=>{
  assert.deepEqual(migrateLegacyScopes(["fitlife.admin","fitlife.all"]),[]);
  assert.deepEqual(resolveSavedAiPermissionScopes("full",[
    MCP_SCOPES.fullAccess,MCP_SCOPES.admin
  ]),[]);
});
test("custom preferences preserve only declared section-specific rights",()=>{
  const scopes=resolveSavedAiPermissionScopes("custom",[
    MCP_SCOPES.nutritionWrite,MCP_SCOPES.admin
  ]);
  assert.ok(scopes.includes(MCP_SCOPES.nutritionRead));
  assert.ok(!scopes.includes(MCP_SCOPES.admin));
  assert.ok(!scopes.includes(MCP_SCOPES.workoutsRead));
});
test("account deletion requires nontrivial exact confirmation and recent auth",()=>{
  assert.equal(ACCOUNT_DELETION_CONFIRMATION,"DELETE MY PLAIVRA ACCOUNT");
  assert.ok(RECENT_REAUTHENTICATION_MS>0);
  assert.ok(RECENT_REAUTHENTICATION_MS<=10*60*1000);
});
