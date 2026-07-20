import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.QA_BASE_URL || "http://127.0.0.1:3000";
const evidenceDir = path.resolve(process.env.QA_EVIDENCE_DIR || "quality-reports/aw1a");
const mockUserId = "11111111-1111-4111-8111-111111111111";
let storedSettings = null;

await mkdir(evidenceDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  locale: "de-DE",
  reducedMotion: "reduce",
  colorScheme: "light"
});

await context.route(/^https:\/\/[^/]+\.supabase\.co\//, async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const method = request.method();
  const wantsObject = (request.headers().accept || "").includes("application/vnd.pgrst.object");

  if (url.pathname.includes("/rest/v1/user_app_settings")) {
    if (method === "GET" || method === "HEAD") {
      const body = storedSettings ? (wantsObject ? storedSettings : [storedSettings]) : [];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "content-range": storedSettings ? "0-0/1" : "0-0/0" },
        body: method === "HEAD" ? "" : JSON.stringify(body)
      });
      return;
    }

    if (method === "POST" || method === "PATCH") {
      let payload = request.postDataJSON();
      if (Array.isArray(payload)) payload = payload[0] ?? {};
      const now = new Date().toISOString();
      storedSettings = {
        ...(storedSettings ?? {}),
        ...payload,
        id: storedSettings?.id ?? "22222222-2222-4222-8222-222222222222",
        user_id: payload.user_id ?? storedSettings?.user_id ?? mockUserId,
        created_at: storedSettings?.created_at ?? now,
        updated_at: now
      };
      await route.fulfill({
        status: method === "POST" ? 201 : 200,
        contentType: "application/json",
        headers: { "content-range": "0-0/1" },
        body: JSON.stringify(wantsObject ? storedSettings : [storedSettings])
      });
      return;
    }
  }

  await route.fulfill({
    status: method === "POST" ? 201 : 200,
    contentType: "application/json",
    headers: { "content-range": "0-0/0" },
    body: method === "HEAD" ? "" : "[]"
  });
});

const page = await context.newPage();
const pageErrors = [];
let currentPathRefreshes = 0;
page.on("pageerror", (error) => pageErrors.push(error.message));
page.on("request", (request) => {
  const url = new URL(request.url());
  const headers = request.headers();
  if (url.pathname === "/settings/preferences" && (headers.rsc || url.searchParams.has("_rsc"))) {
    currentPathRefreshes += 1;
  }
});

await page.goto(baseUrl + "/settings/preferences", { waitUntil: "networkidle", timeout: 30_000 });
const languageSelect = page.locator('select:has(option[value="de"])');
await languageSelect.waitFor({ state: "visible", timeout: 20_000 });
await page.waitForFunction(() => document.documentElement.lang === "en");
assert.ok(storedSettings, "Mock account settings should be initialized");

const results = [];

async function cookieValue() {
  const cookies = await context.cookies(baseUrl);
  return cookies.find((cookie) => cookie.name === "plaivra.language.v1")?.value ?? null;
}

async function localPreference() {
  return page.evaluate(() => window.localStorage.getItem("plaivra.language.v1"));
}

async function assertOneStableRefresh(label) {
  await page.waitForTimeout(1_500);
  assert.equal(currentPathRefreshes, 1, label + " should refresh the current server tree exactly once");
}

async function selectLanguage(preference, expectedLocale, expectedDirection) {
  currentPathRefreshes = 0;
  await languageSelect.selectOption(preference);
  await page.waitForFunction(
    ({ locale, direction }) => document.documentElement.lang === locale && document.documentElement.dir === direction,
    { locale: expectedLocale, direction: expectedDirection }
  );
  await page.waitForFunction(
    (expected) => window.localStorage.getItem("plaivra.language.v1") === expected,
    preference
  );
  assert.equal(await cookieValue(), preference, preference + " should be written to the locale cookie");
  await assertOneStableRefresh(preference);
  results.push({ preference, expectedLocale, expectedDirection, refreshes: currentPathRefreshes, passed: true });
}

// A stale device cache and cookie must not override the successfully loaded account language.
await page.evaluate(() => window.localStorage.setItem("plaivra.language.v1", "ar"));
await context.addCookies([{ name: "plaivra.language.v1", value: "de", url: baseUrl, sameSite: "Lax" }]);
currentPathRefreshes = 0;
await page.reload({ waitUntil: "networkidle", timeout: 30_000 });
await languageSelect.waitFor({ state: "visible", timeout: 20_000 });
await page.waitForFunction(() => document.documentElement.lang === "en" && document.documentElement.dir === "ltr");
await page.waitForFunction(() => window.localStorage.getItem("plaivra.language.v1") === "en");
assert.equal(await cookieValue(), "en", "Account English should replace the stale German cookie");
await assertOneStableRefresh("account-authoritative reconciliation");
results.push({
  scenario: "account-overrides-stale-device",
  locale: "en",
  direction: "ltr",
  refreshes: currentPathRefreshes,
  passed: true
});

await selectLanguage("de", "de", "ltr");
await page.reload({ waitUntil: "networkidle", timeout: 30_000 });
await page.waitForFunction(() => document.documentElement.lang === "de" && document.documentElement.dir === "ltr");
assert.equal(await cookieValue(), "de");
assert.equal(await localPreference(), "de");
assert.equal(new URL(page.url()).pathname, "/settings/preferences");
assert.ok((await page.locator("body").innerText()).includes("Einstellungen"), "Legacy German translations should remain active");
await page.screenshot({ path: path.join(evidenceDir, "settings-german-390x844.png"), fullPage: true });
results.push({ scenario: "german-retained", locale: "de", direction: "ltr", privateUrlStable: true, passed: true });

await selectLanguage("ar", "ar", "rtl");
await page.screenshot({ path: path.join(evidenceDir, "settings-arabic-390x844.png"), fullPage: true });
await selectLanguage("en", "en", "ltr");
await selectLanguage("system", "de", "ltr");
assert.equal(await cookieValue(), "system", "System must be preserved literally in the cookie");
assert.equal(await localPreference(), "system", "System must be preserved literally in local storage");
assert.equal(new URL(page.url()).pathname, "/settings/preferences");
await page.screenshot({ path: path.join(evidenceDir, "settings-system-de-390x844.png"), fullPage: true });

const themeBefore = await page.evaluate(() => document.documentElement.dataset.theme || "");
await page.locator("button[aria-expanded]").first().click();
const alternateTheme = page.locator('button[aria-pressed="false"]').first();
await alternateTheme.waitFor({ state: "visible", timeout: 10_000 });
await alternateTheme.click();
await page.waitForFunction((before) => Boolean(document.documentElement.dataset.theme) && document.documentElement.dataset.theme !== before, themeBefore);
const themeAfter = await page.evaluate(() => document.documentElement.dataset.theme || "");
assert.notEqual(themeAfter, themeBefore, "Theme changes should still apply");
results.push({ scenario: "theme-behavior", before: themeBefore, after: themeAfter, passed: true });

storedSettings.reduce_animations = true;
storedSettings.large_text_mode = true;
storedSettings.compact_mode = true;
await page.reload({ waitUntil: "networkidle", timeout: 30_000 });
await page.waitForFunction(() => {
  const root = document.documentElement;
  return root.classList.contains("reduce-motion") && root.classList.contains("large-text") && root.classList.contains("compact-mode");
});
results.push({ scenario: "accessibility-classes", passed: true });

assert.equal(pageErrors.length, 0, "Rendered QA should not produce page errors");
assert.equal(new URL(page.url()).pathname, "/settings/preferences", "Private URL must remain unprefixed");

const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  browserLocale: "de-DE",
  passed: true,
  pageErrors,
  results
};
await writeFile(path.join(evidenceDir, "rendered-browser-qa.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
await context.close();
await browser.close();
console.log("AW-1A rendered browser QA passed: " + results.length + " validations.");
