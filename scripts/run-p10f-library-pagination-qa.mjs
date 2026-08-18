import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

const baseUrl = process.env.QA_BASE_URL || "http://localhost:3000";
const evidenceDir = path.resolve(
  process.env.QA_P10F_LIBRARY_EVIDENCE_DIR
    || path.join(tmpdir(), "plaivra-p10f-library-pagination-qa")
);
const mockUserId = "10000000-0000-4000-8000-000000000001";
const PAGE_SIZE = 50;
const TOTAL = 120;
const CURSOR_50 = "qa-cursor-50";
const CURSOR_100 = "qa-cursor-100";

function libraryMeta() {
  return {
    apiVersion: "v2",
    locale: "en",
    libraryRelease: {
      id: "e6dc6eaf-aba2-5be5-b089-331aeee4f023",
      version: "p10e-library-v1-c1",
      checksum: "7a53113b410cb6fb6d8846eaf6a356e06df09b502a573738990c225c83a095b4",
      publishedAt: "2026-08-11T00:00:00Z",
      strengthSemanticFingerprint: "73092422c4ef3bb6f386b7081fdeaaacb65778a29d449ba42fa2dda8fd9d142a"
    },
    catalogRelease: {
      id: "fc92eca8-c2ab-5366-ba83-5c64c904aaca",
      version: "p10e-library-v1",
      checksum: "a3f4707871d41efa50de8e56d7760dc06c45765aa35ac4c42f179186176c5271"
    },
    source: "library_v2",
    primarySource: "library_v2",
    fallbackUsed: false,
    fallbackReason: null,
    degraded: false
  };
}

function qaUuid(index, suffix) {
  const value = index.toString(16).padStart(8, "0");
  const tail = `${suffix}${String(index).padStart(11, "0")}`.slice(-12);
  return `${value}-0000-4000-8000-${tail}`;
}

function activity(index) {
  const number = String(index).padStart(3, "0");
  return {
    id: qaUuid(index, "a"),
    revisionId: qaUuid(index, "b"),
    revisionNumber: 1,
    revisionLifecycle: "published",
    revisionChecksum: `qa-revision-${number}`,
    slug: `qa-pagination-exercise-${number}`,
    name: `QA Pagination Exercise ${number}`,
    shortDescription: "P10F rendered cursor pagination authority",
    instructions: [{ order: 1, text: "Perform the movement under control." }],
    difficulty: "intermediate",
    movementPattern: "horizontal_press",
    activityType: { slug: "strength_exercise", name: "Strength" },
    membership: { kind: "owned", visibility: "default", domainPriority: index, primaryDomain: true },
    aliases: [],
    equipment: [{ slug: "barbell", name: "Barbell", requirement: "required" }],
    coverage: [{ role: "primary", name: "Chest", bodyRegion: "Upper body" }],
    executionProfiles: [],
    bodyEffects: []
  };
}

const activities = Array.from({ length: TOTAL }, (_, index) => activity(index + 1));

function cursorPage(cursor) {
  if (!cursor) return { start: 0, end: 50, nextCursor: CURSOR_50 };
  if (cursor === CURSOR_50) return { start: 50, end: 100, nextCursor: CURSOR_100 };
  if (cursor === CURSOR_100) return { start: 100, end: TOTAL, nextCursor: null };
  throw new Error(`Unexpected QA cursor: ${cursor}`);
}

async function setupContext(browser, viewport) {
  const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
  const state = { requests: [] };

  await context.addInitScript(({ userId }) => {
    localStorage.setItem("plaivra.language.v1", "en");
    localStorage.setItem("plaivra-theme-id", "olive");
    localStorage.setItem(`plaivra-exercise-favorites:${userId}`, JSON.stringify([]));
    localStorage.setItem(`plaivra-custom-exercises:${userId}`, JSON.stringify([]));
    localStorage.removeItem("plaivra-workout-browser-filters");
  }, { userId: mockUserId });
  await context.addCookies([{ name: "plaivra.language.v1", value: "en", domain: "localhost", path: "/" }]);

  await context.route("**/api/billing/entitlements", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ entitlements: [] })
  }));
  await context.route("**/api/workouts/active-session", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ session: null })
  }));
  await context.route(/^https:\/\/[^/]+\.supabase\.co\//, async (route) => {
    const method = route.request().method();
    const url = new URL(route.request().url());
    if (method === "GET" && url.pathname.includes("/rest/v1/user_exercise_favorites")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "content-range": "0-0/0" },
        body: "[]"
      });
      return;
    }
    await route.fulfill({
      status: method === "POST" ? 201 : 200,
      contentType: "application/json",
      headers: { "content-range": "0-0/0" },
      body: method === "HEAD" ? "" : "[]"
    });
  });

  await context.route("**/api/activity-catalog/library-domains/strength/**", async (route) => {
    const url = new URL(route.request().url());
    const locale = (url.searchParams.get("locale") || "en").toLowerCase();
    if (locale !== "en") {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ code: "catalog_bad_request", error: "Unexpected QA locale." })
      });
      return;
    }

    if (url.pathname.endsWith("/filters")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [], meta: libraryMeta() })
      });
      return;
    }

    if (url.pathname.endsWith("/activities")) {
      const limit = Number(url.searchParams.get("limit") || "0");
      const cursor = url.searchParams.get("cursor");
      const page = cursorPage(cursor);
      state.requests.push({ locale, limit, cursor, nextCursor: page.nextCursor });
      const data = activities.slice(page.start, page.end);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data,
          pagination: { limit: PAGE_SIZE, returned: data.length, nextCursor: page.nextCursor },
          meta: libraryMeta(),
          restarted: false
        })
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ code: "catalog_not_found", error: "QA route not configured." })
    });
  });

  return { context, state };
}

async function metrics(page) {
  return page.evaluate(() => ({
    horizontalOverflowPx: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
    bodyOverflowPx: Math.max(0, document.body.scrollWidth - window.innerWidth)
  }));
}

async function waitForActivityCount(page, minimum) {
  await page.waitForFunction(
    ({ prefix, expected }) => {
      const names = Array.from(document.querySelectorAll("body *"))
        .filter((node) => node.children.length === 0)
        .map((node) => node.textContent?.trim() || "")
        .filter((text) => text.startsWith(prefix));
      return new Set(names).size >= expected;
    },
    { prefix: "QA Pagination Exercise ", expected: minimum },
    { timeout: 20_000 }
  );
}

async function visibleIdentityCount(page) {
  return page.evaluate(() => {
    const names = Array.from(document.querySelectorAll("body *"))
      .filter((node) => node.children.length === 0)
      .map((node) => node.textContent?.trim() || "")
      .filter((text) => /^QA Pagination Exercise \d{3}$/.test(text));
    return { rendered: names.length, unique: new Set(names).size };
  });
}

async function runScenario(browser, label, viewport) {
  const { context, state } = await setupContext(browser, viewport);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  try {
    const response = await page.goto(`${baseUrl}/workouts?all=1`, { waitUntil: "networkidle", timeout: 45_000 });
    if (!response?.ok()) throw new Error(`${label}: /workouts returned ${response?.status() ?? "no response"}`);
    await waitForActivityCount(page, 50);

    const initial = await visibleIdentityCount(page);
    if (initial.unique !== 50 || initial.rendered !== 50) {
      throw new Error(`${label}: expected exactly 50 unique initial identities, observed ${JSON.stringify(initial)}`);
    }
    if (state.requests.length !== 1) throw new Error(`${label}: expected one initial activities request, observed ${state.requests.length}`);
    if (state.requests[0].limit !== PAGE_SIZE || state.requests[0].cursor !== null || state.requests[0].nextCursor !== CURSOR_50) {
      throw new Error(`${label}: page-1 cursor contract drifted: ${JSON.stringify(state.requests[0])}`);
    }

    const loadMore = page.getByRole("button", { name: "Load more", exact: false });
    await loadMore.waitFor({ timeout: 10_000 });
    await loadMore.click();
    await waitForActivityCount(page, 100);

    const afterSecondPage = await visibleIdentityCount(page);
    if (afterSecondPage.unique !== 100 || afterSecondPage.rendered !== 100) {
      throw new Error(`${label}: expected 100 unique identities after Load More, observed ${JSON.stringify(afterSecondPage)}`);
    }
    if (state.requests.length !== 2 || state.requests[1].cursor !== CURSOR_50 || state.requests[1].nextCursor !== CURSOR_100) {
      throw new Error(`${label}: page-2 cursor contract drifted: ${JSON.stringify(state.requests)}`);
    }
    if (!(await loadMore.isVisible())) throw new Error(`${label}: Load More disappeared after 100 identities`);

    await loadMore.click();
    await waitForActivityCount(page, TOTAL);
    const terminal = await visibleIdentityCount(page);
    if (terminal.unique !== TOTAL || terminal.rendered !== TOTAL) {
      throw new Error(`${label}: expected ${TOTAL} unique terminal identities, observed ${JSON.stringify(terminal)}`);
    }
    if (state.requests.length !== 3 || state.requests[2].cursor !== CURSOR_100 || state.requests[2].nextCursor !== null) {
      throw new Error(`${label}: terminal cursor contract drifted: ${JSON.stringify(state.requests)}`);
    }
    await page.waitForTimeout(100);
    if (await loadMore.isVisible()) throw new Error(`${label}: Load More remained visible after terminal cursor`);

    const overflow = await metrics(page);
    if (overflow.horizontalOverflowPx > 0 || overflow.bodyOverflowPx > 0) {
      throw new Error(`${label}: horizontal overflow detected ${JSON.stringify(overflow)}`);
    }
    if (errors.length) throw new Error(`${label}: page errors: ${errors.join(" | ")}`);

    const screenshot = path.join(evidenceDir, `${label}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    return {
      scenario: label,
      viewport,
      initialUnique: initial.unique,
      afterLoadMoreUnique: afterSecondPage.unique,
      loadMoreVisibleAfter100: true,
      terminalUnique: terminal.unique,
      duplicates: terminal.rendered - terminal.unique,
      page1Cursor: null,
      page1NextCursor: CURSOR_50,
      page2Cursor: CURSOR_50,
      page2NextCursor: CURSOR_100,
      finalCursor: null,
      pageSize: PAGE_SIZE,
      source: "library_v2",
      fallbackUsed: false,
      degraded: false,
      horizontalOverflowPx: overflow.horizontalOverflowPx,
      screenshot
    };
  } finally {
    await context.close();
  }
}

await mkdir(evidenceDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const scenarios = [];
try {
  scenarios.push(await runScenario(browser, "p10f-pagination-mobile-390x844", { width: 390, height: 844 }));
  scenarios.push(await runScenario(browser, "p10f-pagination-desktop-1280x800", { width: 1280, height: 800 }));
} finally {
  await browser.close();
}

const report = {
  status: "pass",
  gate: "P10F-EXERCISE-LIBRARY-RENDERED-PAGINATION",
  pageSize: PAGE_SIZE,
  fixtureUniverse: TOTAL,
  acceptance: {
    initial50: true,
    secondPageRunning100: true,
    loadMoreRemainsBeyond60: true,
    duplicates: 0,
    terminalCursorOnlyAtEnd: true,
    mobileOverflow: 0,
    desktopOverflow: 0
  },
  scenarios
};
await writeFile(path.join(evidenceDir, "p10f-library-pagination-qa.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
