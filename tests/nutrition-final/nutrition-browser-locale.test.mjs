/** Browser QA with synthetic local account fixtures; refuses Production hosts. */
import assert from "node:assert/strict";
import { after,test } from "node:test";
import { existsSync,mkdirSync } from "node:fs";
import { join,resolve } from "node:path";
import { chromium } from "@playwright/test";

const languages=[["en","ltr"],["de","ltr"],["ar","rtl"]];
function localServer(){
  const raw=process.env.NUTRITION_E2E_BASE_URL;
  if(!raw)throw Error("Missing Nutrition disposable browser server URL");
  const url=new URL(raw);
  if(!["localhost","127.0.0.1","[::1]"].includes(url.hostname) ||
    !["http:","https:"].includes(url.protocol) || url.username || url.password)
    throw Error("Nutrition browser tests must target localhost only");
  return url.origin;
}
function syntheticSession(locale,kind){
  const key="NUTRITION_E2E_"+locale.toUpperCase()+"_"+kind.toUpperCase()+"_STORAGE";
  const file=process.env[key];
  if(!file||!existsSync(file))throw Error("Missing isolated synthetic auth fixture: "+key);
  return file;
}
const screenshotDir=resolve("nutrition-quality-reports/browser");
mkdirSync(screenshotDir,{recursive:true});
let browser;
after(async()=>{if(browser)await browser.close()});
async function open(locale,kind){
  const base=localServer(),session=syntheticSession(locale,kind);
  if(!browser)browser=await chromium.launch({headless:true});
  const context=await browser.newContext({storageState:session,viewport:{width:390,height:844}});
  return {base,context,page:await context.newPage()};
}
for(const [locale,expectedDir] of languages){
  for(const kind of ["empty","populated"]){
    test("Food Library "+locale+" / "+kind+" is authenticated, localized and accessible",async()=>{
      const {base,context,page}=await open(locale,kind);
      const errors=[];
      page.on("pageerror",e=>errors.push(e.message));
      try{
        const response=await page.goto(base+"/calories/food-hub",{waitUntil:"domcontentloaded",timeout:30000});
        assert.equal(response?.status(),200);
        assert.ok(!page.url().includes("/login"),"synthetic account must remain authenticated");
        const main=page.locator("main[lang]");
        await main.waitFor({state:"visible",timeout:15000});
        assert.equal(await main.getAttribute("lang"),locale);
        assert.equal(await main.getAttribute("dir"),expectedDir);
        assert.equal(await main.getByRole("heading",{level:1}).count(),1);
        const search=main.locator("input").first();
        assert.ok(await main.locator("input").count()>0);
        await search.focus();
        assert.equal(await search.evaluate(el=>el===document.activeElement),true);
        // "Populated" is proven by real rendered Food rows; an empty UI is not a pass.
        const results=main.locator('section[aria-live="polite"]');
        const rows=results.locator(':scope > div.grid > div');
        if(kind==="populated"){
          await rows.first().waitFor({state:"visible",timeout:20000});
          assert.ok(await rows.count()>0);
        }else{
          await results.locator(':scope > div.text-center').waitFor({state:"visible",timeout:20000});
          assert.equal(await rows.count(),0);
        }
        assert.equal(await main.getByRole("alert").count(),0,"No silent Food API failure allowed");
        await page.screenshot({path:join(screenshotDir,"food-mobile-"+locale+"-"+kind+".png"),fullPage:true});
        await page.setViewportSize({width:1440,height:900});
        assert.equal(await main.getAttribute("dir"),expectedDir);
        assert.equal(await main.getAttribute("lang"),locale);
        await page.screenshot({path:join(screenshotDir,"food-desktop-"+locale+"-"+kind+".png"),fullPage:true});
        assert.deepEqual(errors,[]);
      }finally{await context.close()}
    });
  }
}
test("populated synthetic account can reach all four core Nutrition destinations",async()=>{
  const {base,context,page}=await open("en","populated");
  try{
    for(const path of ["/calories","/calories/food-hub","/my-meal-plan","/my-recipes"]){
      const result=await page.goto(base+path,{waitUntil:"domcontentloaded",timeout:30000});
      assert.equal(result?.status(),200,"HTTP 200 required for "+path);
      assert.ok(!page.url().includes("/login"),"auth redirected at "+path);
    }
  }finally{await context.close()}
});


// N107 authenticated browser error-state and offline visibility matrix.
// These require local isolated synthetic sessions; no Production hostname allowed.
for(const [locale] of languages){
  test("offline Food Library state is visible and clears on reconnection in "+locale,async()=>{
    const {base,context,page}=await open(locale,"populated");
    try{
      const response=await page.goto(base+"/calories/food-hub",{
        waitUntil:"domcontentloaded",timeout:30000
      });
      assert.equal(response?.status(),200);
      const main=page.locator("main[lang]");
      await main.waitFor({state:"visible",timeout:15000});
      await context.setOffline(true);
      const offlineStatus=main.getByRole("status");
      await offlineStatus.waitFor({state:"visible",timeout:10000});
      assert.ok((await offlineStatus.textContent())?.trim());
      await context.setOffline(false);
      await offlineStatus.waitFor({state:"hidden",timeout:10000});
    }finally{
      await context.close();
    }
  });
}
test("local Food Library API failure is surfaced as a user-visible error",async()=>{
  const {base,context,page}=await open("en","empty");
  try{
    await page.route("**/api/nutrition/v1/foods?**",async route=>{
      await route.fulfill({status:503,contentType:"application/json",
        body:JSON.stringify({error:"synthetic local fault"})});
    });
    const result=await page.goto(base+"/calories/food-hub",{
      waitUntil:"domcontentloaded",timeout:30000
    });
    assert.equal(result?.status(),200);
    const main=page.locator("main[lang]");
    await main.waitFor({state:"visible",timeout:15000});
    await main.getByRole("alert").waitFor({state:"visible",timeout:15000});
    assert.ok((await main.getByRole("alert").textContent())?.trim());
  }finally{
    await context.close();
  }
});
