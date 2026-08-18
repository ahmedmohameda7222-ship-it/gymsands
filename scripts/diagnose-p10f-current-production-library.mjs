import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const origin = new URL(process.env.PLAIVRA_PRODUCTION_URL || "https://app.plaivra.com");
const accounts = [
  {
    label: "populated",
    email: process.env.PLAIVRA_SMOKE_POPULATED_EMAIL,
    password: process.env.PLAIVRA_SMOKE_POPULATED_PASSWORD
  },
  {
    label: "empty",
    email: process.env.PLAIVRA_SMOKE_EMPTY_EMAIL,
    password: process.env.PLAIVRA_SMOKE_EMPTY_PASSWORD
  }
].filter((account) => account.email && account.password);
const output = resolve(process.env.PLAIVRA_P10F_DIAGNOSTIC_OUTPUT || "p10f-current-production-library.json");

if (origin.protocol !== "https:") throw new Error("Production diagnostic requires HTTPS.");
if (!accounts.length) throw new Error("BLOCKED — Production smoke credential unavailable for current-provider diagnostic.");
mkdirSync(resolve(output, ".."), { recursive: true });

function safeMeta(payload) {
  const meta = payload?.meta ?? {};
  return {
    source: meta.source ?? null,
    degraded: Boolean(meta.degraded),
    fallbackUsed: meta.fallbackUsed ?? null,
    fallbackReason: meta.fallbackReason ?? null,
    libraryRelease: meta.libraryRelease ? {
      id: meta.libraryRelease.id ?? null,
      version: meta.libraryRelease.version ?? null,
      checksum: meta.libraryRelease.checksum ?? null
    } : null,
    catalogRelease: meta.catalogRelease ? {
      id: meta.catalogRelease.id ?? null,
      version: meta.catalogRelease.version ?? null,
      checksum: meta.catalogRelease.checksum ?? null
    } : null
  };
}

async function login(page) {
  for (const account of accounts) {
    await page.goto(new URL("/login", origin).toString(), { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.locator('input[type="email"]').fill(account.email);
    await page.locator('input[type="password"]').fill(account.password);
    await page.locator('button[type="submit"]').click();
    const completed = await page.waitForURL((url) => url.pathname !== "/login", { timeout: 15_000 }).then(() => true).catch(() => false);
    if (completed && new URL(page.url()).pathname !== "/login") return account.label;
  }
  throw new Error("BLOCKED — configured Production smoke accounts could not authenticate.");
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ locale: "en-GB", timezoneId: "Europe/Berlin" });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  const authenticatedAccountClass = await login(page);

  const captures = [];
  page.on("response", async (response) => {
    try {
      const url = new URL(response.url());
      if (!url.pathname.endsWith("/api/activity-catalog/library-domains/strength/activities")) return;
      const payload = await response.json();
      captures.push({
        status: response.status(),
        locale: url.searchParams.get("locale"),
        query: url.searchParams.get("query") || "",
        cursorPresent: Boolean(url.searchParams.get("cursor")),
        returned: Array.isArray(payload?.data) ? payload.data.length : null,
        nextCursorPresent: Boolean(payload?.pagination?.nextCursor),
        meta: safeMeta(payload)
      });
    } catch {
      // The final assertion below fails closed if no usable response was captured.
    }
  });

  const navigation = await page.goto(new URL("/workouts?all=1", origin).toString(), { waitUntil: "domcontentloaded", timeout: 45_000 });
  if (!navigation?.ok()) throw new Error(`Production /workouts returned ${navigation?.status() ?? "no response"}.`);

  const deadline = Date.now() + 20_000;
  while (captures.length < 1 && Date.now() < deadline) await page.waitForTimeout(100);
  if (!captures.length) throw new Error("No Production Exercise Library response was captured.");

  const first = captures[0];
  if (first.status !== 200) throw new Error(`Production Exercise Library returned HTTP ${first.status}.`);

  const loadMore = page.getByRole("button", { name: /load more/i }).first();
  if (first.nextCursorPresent && await loadMore.isVisible().catch(() => false)) {
    await loadMore.click();
    const secondDeadline = Date.now() + 20_000;
    while (captures.length < 2 && Date.now() < secondDeadline) await page.waitForTimeout(100);
  }

  const second = captures[1] ?? null;
  const classification = first.meta.source === "legacy"
    ? first.meta.degraded
      ? "v2_to_legacy_fallback"
      : "direct_legacy_selected_source"
    : first.meta.source === "library_v2"
      ? "healthy_library_v2"
      : "unknown";

  const evidence = {
    status: "pass",
    gate: "P10F-CURRENT-PRODUCTION-PROVIDER-DIAGNOSTIC",
    productionOrigin: origin.origin,
    authenticatedAccountClass,
    classification,
    firstPage: first,
    secondPage: second,
    credentialExposed: false,
    productionMutationPerformed: false
  };
  writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence));
} finally {
  await browser.close();
}
