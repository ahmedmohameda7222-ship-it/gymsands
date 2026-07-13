import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.QA_BASE_URL || "http://127.0.0.1:3000";
const evidenceRoot = path.join(process.cwd(), "quality-reports", "train-rendered");
const languages = {
  en: { continue: "Continue", addExercises: "Add exercises" },
  de: { continue: "Weiter", addExercises: "Übungen hinzufügen" },
  ar: { continue: "متابعة", addExercises: "إضافة تمارين" }
};
const overviewViewports = [[390, 844], [768, 1024], [1440, 900]];
const builderOneViewports = [[390, 844], [1440, 900]];
const builderTwoViewports = [[390, 844], [768, 1024], [1440, 900]];
const pickerViewports = [[360, 780], [390, 844], [768, 1024], [1440, 900]];
const observations = [];
const failures = [];

await mkdir(evidenceRoot, { recursive: true });
const browser = await chromium.launch({ headless: true });

function fileName(surface, width, height) {
  return `${surface}-${width}x${height}.png`;
}

async function inspect(page, language, surface, width, height, rootSelector) {
  const result = await page.evaluate(({ rootSelector }) => {
    const roots = [...document.querySelectorAll(rootSelector)];
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const interactive = roots.flatMap((root) => [...root.querySelectorAll("button, a, input, select, textarea, [role='button'], [role='tab']")]).filter(visible);
    const unnamed = interactive.filter((element) => {
      const label = element.getAttribute("aria-label") || element.getAttribute("title") || element.textContent || element.getAttribute("placeholder") || ("labels" in element && element.labels?.length ? "associated-label" : "");
      return !String(label || "").trim();
    }).map((element) => ({ tag: element.tagName.toLowerCase(), text: String(element.textContent || "").trim().slice(0, 80) }));
    const compact = interactive.filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width < 43.5 || rect.height < 43.5;
    }).map((element) => {
      const rect = element.getBoundingClientRect();
      return { tag: element.tagName.toLowerCase(), text: String(element.textContent || element.getAttribute("aria-label") || "").trim().slice(0, 80), width: Math.round(rect.width), height: Math.round(rect.height) };
    });
    return {
      horizontalOverflowPx: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      unnamed,
      compact,
      internalSourceVisible: document.body.innerText.includes("plaivra_legacy_workouts"),
      direction: roots[0] ? getComputedStyle(roots[0]).direction : getComputedStyle(document.documentElement).direction,
      pageErrors: window.__trainQaPageErrors || [],
      consoleErrors: window.__trainQaConsoleErrors || []
    };
  }, { rootSelector });
  const observation = { language, surface, viewport: `${width}x${height}`, ...result };
  observations.push(observation);
  if (result.horizontalOverflowPx > 1 || result.unnamed.length || result.compact.length || result.internalSourceVisible || result.pageErrors.length || result.consoleErrors.length || (language === "ar" && result.direction !== "rtl")) failures.push(observation);
}

async function selectLanguage(page, language) {
  await page.goto(`${baseUrl}/settings/preferences`, { waitUntil: "networkidle" });
  const languageSelect = page.locator("select").first();
  await languageSelect.waitFor({ state: "visible" });
  await languageSelect.selectOption(language);
  await page.waitForTimeout(250);
  await page.locator('a[href="/my-workout/plans"]').first().click();
  await page.waitForURL(/\/my-workout\/plans$/);
  await page.locator("[data-train-today-card]").waitFor({ state: "visible" });
}

async function goPlans(page) {
  if (!/\/my-workout\/plans$/.test(new URL(page.url()).pathname)) {
    await page.locator('a[href="/my-workout/plans"]').first().click();
    await page.waitForURL(/\/my-workout\/plans$/);
  }
  await page.locator("[data-train-today-card]").waitFor({ state: "visible" });
}

async function goBuilder(page) {
  await goPlans(page);
  await page.locator('button[aria-haspopup="menu"]').first().click();
  await page.locator('[role="menuitem"]').nth(1).click();
  await page.waitForURL(/\/my-workout\/plans\/builder$/);
  await page.locator("[data-train-builder]").waitFor({ state: "visible" });
}

for (const [language, labels] of Object.entries(languages)) {
  const languageDir = path.join(evidenceRoot, language);
  await mkdir(languageDir, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: language === "de" ? "de-DE" : language === "ar" ? "ar" : "en-US", reducedMotion: "reduce", colorScheme: "light" });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !/favicon|Failed to load resource|ERR_CONNECTION_REFUSED/i.test(message.text())) consoleErrors.push(message.text());
  });
  await page.addInitScript(() => {
    window.__trainQaPageErrors = [];
    window.__trainQaConsoleErrors = [];
  });

  await selectLanguage(page, language);

  for (const [width, height] of overviewViewports) {
    await page.setViewportSize({ width, height });
    await goPlans(page);
    const tabs = page.locator("[data-train-week] [role='tab']");
    const count = await tabs.count();
    const todayIndex = await tabs.evaluateAll((items) => items.findIndex((item) => item.getAttribute("aria-current") === "date"));
    const selectedIndex = todayIndex === count - 1 ? Math.max(0, todayIndex - 1) : Math.min(count - 1, todayIndex + 1);
    if (selectedIndex !== todayIndex) await tabs.nth(selectedIndex).click();
    await page.screenshot({ path: path.join(languageDir, fileName("overview-selected-day", width, height)), fullPage: true });
    const distinct = await page.evaluate(() => {
      const today = document.querySelector('[data-train-week] [aria-current="date"]');
      const selected = document.querySelector('[data-train-week] [aria-selected="true"]');
      return Boolean(today && selected && today !== selected);
    });
    if (!distinct) failures.push({ language, surface: "overview-selected-day", viewport: `${width}x${height}`, reason: "Today and selected day were not distinct." });
    await inspect(page, language, "overview-selected-day", width, height, "[data-train-today-card], [data-train-week], [data-active-plan-row], [data-compact-plan-row]");
  }

  for (const [width, height] of builderOneViewports) {
    await page.setViewportSize({ width, height });
    await goBuilder(page);
    await page.screenshot({ path: path.join(languageDir, fileName("builder-step-1", width, height)), fullPage: true });
    await inspect(page, language, "builder-step-1", width, height, "[data-train-builder]");
  }

  for (const [width, height] of builderTwoViewports) {
    await page.setViewportSize({ width, height });
    await goBuilder(page);
    await page.getByRole("button", { name: labels.continue, exact: true }).click();
    await page.locator('[data-builder-step="days"]').waitFor({ state: "visible" });
    await page.screenshot({ path: path.join(languageDir, fileName("builder-step-2", width, height)), fullPage: true });
    const localValidation = await page.locator('[data-builder-step="days"]').innerText();
    if (!localValidation.includes(language === "en" ? "Add at least one exercise" : language === "de" ? "Füge mindestens eine Übung" : "أضف تمرينًا واحدًا")) failures.push({ language, surface: "builder-step-2", viewport: `${width}x${height}`, reason: "Local incomplete-day validation was missing." });
    await inspect(page, language, "builder-step-2", width, height, "[data-train-builder]");
  }

  for (const [width, height] of pickerViewports) {
    await page.setViewportSize({ width, height });
    await goBuilder(page);
    await page.getByRole("button", { name: labels.continue, exact: true }).click();
    await page.locator('[data-builder-step="days"]').waitFor({ state: "visible" });
    const addButton = page.getByRole("button", { name: labels.addExercises, exact: true }).first();
    await addButton.click();
    const picker = page.locator("[data-train-exercise-picker]");
    await picker.waitFor({ state: "visible" });
    await page.locator("[data-picker-results] article").first().waitFor({ state: "visible" });
    await page.screenshot({ path: path.join(languageDir, fileName("exercise-picker", width, height)), fullPage: true });
    const pickerMetrics = await page.evaluate(() => {
      const picker = document.querySelector("[data-train-exercise-picker]");
      const resultGrid = document.querySelector("[data-picker-results]");
      const footer = document.querySelector("[data-picker-footer]");
      const first = resultGrid?.querySelector("article");
      if (!picker || !resultGrid || !footer || !first) return null;
      const pickerRect = picker.getBoundingClientRect();
      const footerRect = footer.getBoundingClientRect();
      const firstStyle = getComputedStyle(first);
      const columns = getComputedStyle(resultGrid).gridTemplateColumns.split(" ").filter(Boolean).length;
      return { width: pickerRect.width, height: pickerRect.height, footerVisible: footerRect.bottom <= innerHeight + 1 && footerRect.top < innerHeight, columns, resultMinHeight: firstStyle.minHeight };
    });
    if (!pickerMetrics || pickerMetrics.width < width - 2 || pickerMetrics.height < height - 2 || !pickerMetrics.footerVisible || pickerMetrics.columns > 2 || (width <= 430 && pickerMetrics.columns !== 1)) failures.push({ language, surface: "exercise-picker", viewport: `${width}x${height}`, reason: "Picker geometry or column contract failed.", pickerMetrics });
    await inspect(page, language, "exercise-picker", width, height, "[data-train-exercise-picker]");
    await page.keyboard.press("Escape");
    await picker.waitFor({ state: "hidden" });
    const focusReturned = await addButton.evaluate((element) => document.activeElement === element);
    if (!focusReturned) failures.push({ language, surface: "exercise-picker", viewport: `${width}x${height}`, reason: "Focus did not return to the Add exercises trigger after Escape." });
  }

  await context.close();
}

await browser.close();
const report = { generatedAt: new Date().toISOString(), baseUrl, languages: Object.keys(languages), screenshots: 36, observations, failures, passed: failures.length === 0 };
await writeFile(path.join(evidenceRoot, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Train rendered QA: ${observations.length} observations, ${failures.length} failures, 36 screenshots.`);
if (failures.length) process.exitCode = 1;
