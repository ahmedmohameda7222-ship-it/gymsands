/** Browser QA with synthetic local account fixtures; refuses Production hosts. */
import assert from "node:assert/strict";
import { after,test } from "node:test";
import { existsSync,mkdirSync,readFileSync } from "node:fs";
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
  const page=await context.newPage();
  // UI-only synthetic results; never trust these as actual Catalog/API or RLS proof.
  await page.route("**/api/nutrition/v1/foods?**",async route=>{
    const fixture={
      id:"00000000-0000-4000-8000-000000000101",source:"catalog",
      name:"QA Synthetic Rice",brand:null,category:null,cuisine:null,
      servingLabel:"100 g",verified:false,favorite:false,recentAt:null,
      frequency:0,locale,aliases:[],tags:[],nutritionLabels:[],
      nutrition:{calories:null,protein_g:null,carbs_g:null,fat_g:null,
        saturated_fat_g:null,fiber_g:null,sugars_g:null,sodium_mg:null,
        basis_amount:null,basis_unit:null}
    };
    await route.fulfill({status:200,contentType:"application/json",
      body:JSON.stringify({
        items:kind==="populated"?[fixture]:[],nextCursor:null
      })});
  });
  return {base,context,page};
}
for(const [locale,expectedDir] of languages){
  for(const kind of ["empty","populated"]){
    test("Food Library "+locale+" / "+kind+" is mock-authorized, localized and accessible",async()=>{
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

// N096 / N107 source-label regression: the actual browser accessibility matrix
// remains deferred to final QA, but these accessible input names must be kept.
test("Diary logging input accessible-name source contract",()=>{
  const src=readFileSync(resolve("components/nutrition/diary/logging-session.tsx"),"utf8");
  for(const label of [
    'aria-label={et("searchFoods")}',
    'aria-label={et("barcode")}',
    'aria-label={text.optionalName}',
    'aria-label={et("calories")}',
    'aria-label={text.optionalProtein}',
    'aria-label={text.optionalCarbs}',
    'aria-label={text.optionalFat}'
  ]){
    assert.ok(src.includes(label),"Missing accessible input name: "+label);
  }
});

// N096 / N107 equipment editor input fields need persistent accessible names.
// Placeholders are not a reliable label when users enter text or use screen readers.
test("Recipe equipment name, quantity, and note have localized accessible names",()=>{
  const src=readFileSync(resolve("components/nutrition/recipes/recipe-editor.tsx"),"utf8");
  for(const key of ["equipment","equipmentQuantity","optionalNote"]){
    assert.ok(src.includes(`placeholder={nt("${key}")} aria-label={nt("${key}")}`),
      "Missing localized equipment field label: "+key);
  }
});

// N096: date selector needs a localized accessible name separate from the
// adjacent previous/next day buttons. The existing Eat dictionary has "date".
test("Diary date input is named with the existing EN DE AR locale text",()=>{
  const src=readFileSync(resolve("components/nutrition/diary/diary-page.tsx"),"utf8");
  assert.ok(src.includes('<input type="date" aria-label={et("date")}'),
    "The diary date picker must identify itself to assistive technology");
});

// N096: all five Meal Plan edit/copy dialogs must render localized copy, never
// hardcoded English. The en dictionary is the typed key contract for de/ar.
test("Meal Plan editing and copying dialogs retain EN DE AR translated copy",()=>{
  const src=readFileSync(resolve("components/nutrition/meal-plan/meal-plan-page.tsx"),"utf8");
  const dictionary=readFileSync(resolve("lib/i18n/nutrition-v1.ts"),"utf8");
  for(const key of ["addMealSlotTitle","mealSlotName","mealSlotExample",
    "editPlannedItem","frozenPlanEditHint","plannedTime","reminderOn",
    "reminderOff","reminderPermissionHint","enableReminder","disableReminder",
    "movePlannedItem","mealSlot","copySelectedDays","copySelectedDaysHint",
    "copyDay","copyDayOrWeekHint","targetDay","dateWithinTargetWeek"]){
    assert.ok(src.includes('nt("'+key+'")'),"Missing localized modal copy: "+key);
    assert.equal(dictionary.split(key+':').length-1,3,
      "Missing an EN/DE/AR translation: "+key);
  }
  for(const legacy of [">Add meal slot</h2>",">Edit planned item</h2>",
    ">Move planned item</h2>",">Copy / repeat to selected days</h2>",
    ">Enable reminder</button>",">Disable reminder</button>"]){
    assert.equal(src.includes(legacy),false,"Untranslated Meal Plan modal text: "+legacy);
  }
});

// N096: skipped-item review must not show English-only messages in DE/AR.
test("Skipped Shopping review uses EN DE AR labels and source details",()=>{
  const src=readFileSync(resolve("components/nutrition/meal-plan/meal-plan-page.tsx"),"utf8");
  const dict=readFileSync(resolve("lib/i18n/nutrition-v1.ts"),"utf8");
  for(const key of ["shoppingReviewTitle","skippedShoppingContribution","reviewAndRemove"]){
    assert.ok(src.includes('nt("'+key+'"'),"Missing localized Shopping text: "+key);
    assert.equal(dict.split(key+':').length-1,3,"Missing EN DE AR Shopping key: "+key);
  }
  assert.equal(src.includes("was skipped, but its frozen Shopping contribution is still included."),false);
  assert.equal(src.includes(">Review & Remove</button>"),false);
});

// N096: failed favorite requests must not make the UI show unsaved favorites.
// This source contract is independent of the deferred synthetic browser run.
test("Food Library favorite state only commits after server acceptance",()=>{
  const src=readFileSync(resolve("components/nutrition/food-library/food-library-page.tsx"),"utf8");
  const begin=src.indexOf("async function toggleFavorite(");
  const end=src.indexOf("\n  function openWorkspace(",begin);
  assert.ok(begin>0&&end>begin,"Expected bounded favorite mutation handler");
  const handler=src.slice(begin,end);
  assert.ok(handler.includes("await foodLibraryApi("),"Favorites must await server response");
  assert.ok(handler.indexOf("await foodLibraryApi(")<handler.indexOf("setRows("),
    "Favorite display must update only after response");
  assert.ok(handler.includes("if (!response.ok) throw"),"Failed HTTP response must not mark saved");
  assert.ok(handler.includes("catch")&&handler.includes("setError("),
    "Rejected network request must surface an error instead of unhandled rejection");
});

// N096: Meal Plan action labels and notices must not fall back to English
// even though the page and its dialogs already support DE/AR layouts.
test("Meal Plan action notices and reminder messages have EN DE AR strings",()=>{
  const source=readFileSync(resolve("components/nutrition/meal-plan/meal-plan-page.tsx"),"utf8");
  const dict=readFileSync(resolve("lib/i18n/nutrition-v1.ts"),"utf8");
  for(const key of [
    "markEaten","logWithChanges","placeholderCannotMarkEaten",
    "copyEmptyDay","copyEmptyWeek","copySuccessDay","copySuccessWeek",
    "planningPromptCopied","planningPromptFallback","mealReminderNow"
  ]){
    assert.equal(dict.split(key+':').length-1,3,"Missing localized action "+key);
    assert.ok(source.includes('nt("'+key+'"')||source.includes('"'+key+'"'),
      "Missing localized action call "+key);
  }
  assert.equal(source.includes('const markEatenLabel = "Mark eaten"'),false);
  assert.equal(source.includes('const logWithChangesLabel = "Log with changes"'),false);
  assert.equal(source.includes('There is nothing to copy from this'),false);
  assert.equal(source.includes('copied with fresh planned-item identities'),false);
});

// N095: queued cross-week copies must preserve errors in the contract-defined
// lastError field, not in a silently ignored ad-hoc JSON "error" property.
test("Meal Plan offline copy retry errors use persisted lastError contract",()=>{
  const src=readFileSync(resolve("components/nutrition/meal-plan/meal-plan-page.tsx"),"utf8");
  const start=src.indexOf("async function writeCopiesToWeek("),end=src.indexOf("async function saveBulkCopy(",start);
  assert.ok(start>0&&end>start);
  const copy=src.slice(start,end);
  assert.ok(copy.includes("{ lastError: cause instanceof Error"),
    "Copy failure reason must be stored in the queued mutation lastError field");
  assert.ok(!copy.includes("{ error: cause instanceof Error"),
    "An unknown error property would not be displayed by queue readers");
});
