import fs from "node:fs";
import process from "node:process";

const EXPECTED_LIBRARY_RELEASE = {
  id: "e6dc6eaf-aba2-5be5-b089-331aeee4f023",
  version: "p10e-library-v1-c1",
  checksum: "7a53113b410cb6fb6d8846eaf6a356e06df09b502a573738990c225c83a095b4",
  strengthSemanticFingerprint: "73092422c4ef3bb6f386b7081fdeaaacb65778a29d449ba42fa2dda8fd9d142a"
};
const EXPECTED_CATALOG_RELEASE = {
  id: "fc92eca8-c2ab-5366-ba83-5c64c904aaca",
  version: "p10e-library-v1",
  checksum: "a3f4707871d41efa50de8e56d7760dc06c45765aa35ac4c42f179186176c5271"
};
const EXPECTED_STRENGTH_COUNT = 584;
const PAGE_SIZE = 50;
const MAX_PAGES = 20;
const RETIRED_CUSTOM_ORIGIN = "https://catalog-api.plaivra.com";
const CANONICAL_VERCEL_ORIGIN = "https://plaivra-activity-catalog-api.vercel.app";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const configuredBaseUrl = process.env.PLAIVRA_ACTIVITY_CATALOG_BASE_URL ?? "";
const apiKey = process.env.PLAIVRA_ACTIVITY_CATALOG_API_KEY ?? "";
assert(configuredBaseUrl, "BLOCKED — missing cross-service acceptance base URL");
assert(apiKey.length >= 20, "BLOCKED — missing cross-service acceptance credential");
assert(!process.env.NEXT_PUBLIC_PLAIVRA_ACTIVITY_CATALOG_API_KEY, "Catalog API key must remain server-only.");

const configuredOrigin = new URL(configuredBaseUrl);
assert(configuredOrigin.protocol === "https:", "Cross-service acceptance requires HTTPS.");
assert(!configuredOrigin.username && !configuredOrigin.password && !configuredOrigin.search && !configuredOrigin.hash, "Catalog base URL must not contain credentials, query, or fragment.");

const baseUrl = configuredOrigin.origin === RETIRED_CUSTOM_ORIGIN
  ? new URL(CANONICAL_VERCEL_ORIGIN)
  : configuredOrigin;

function assertAuthority(payload, locale) {
  const meta = payload?.meta ?? {};
  assert(meta.locale === locale, `Catalog locale mismatch for ${locale}.`);
  assert(meta.libraryRelease?.id === EXPECTED_LIBRARY_RELEASE.id, "Library release ID drifted.");
  assert(meta.libraryRelease?.version === EXPECTED_LIBRARY_RELEASE.version, "Library release version drifted.");
  assert(meta.libraryRelease?.checksum === EXPECTED_LIBRARY_RELEASE.checksum, "Library release checksum drifted.");
  assert(meta.libraryRelease?.strengthSemanticFingerprint === EXPECTED_LIBRARY_RELEASE.strengthSemanticFingerprint, "Strength fingerprint drifted.");
  assert(meta.catalogRelease?.id === EXPECTED_CATALOG_RELEASE.id, "Catalog release ID drifted.");
  assert(meta.catalogRelease?.version === EXPECTED_CATALOG_RELEASE.version, "Catalog release version drifted.");
  assert(meta.catalogRelease?.checksum === EXPECTED_CATALOG_RELEASE.checksum, "Catalog release checksum drifted.");
}

async function request(pathname) {
  const url = new URL(pathname, baseUrl);
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(20_000)
  });
  const payload = await response.json().catch(() => null);
  assert(response.ok, `Catalog live acceptance returned HTTP ${response.status} for ${url.pathname}.`);
  assert(payload && typeof payload === "object", `Catalog returned a non-JSON response for ${url.pathname}.`);
  const serialized = JSON.stringify(payload);
  assert(!serialized.includes(apiKey), "Catalog response leaked the server-only API key.");
  return payload;
}

async function fetchPage(locale, cursor = null) {
  const params = new URLSearchParams({ locale, limit: String(PAGE_SIZE) });
  if (cursor) params.set("cursor", cursor);
  const payload = await request(`/v2/library-domains/strength/activities?${params}`);
  assertAuthority(payload, locale);
  assert(Array.isArray(payload.data), `Strength ${locale} page data is not an array.`);
  assert(payload.pagination?.limit === PAGE_SIZE, `Strength ${locale} page-size contract drifted.`);
  return payload;
}

const first = await fetchPage("en");
assert(first.data.length === PAGE_SIZE, "Strength page 1 must contain 50 activities.");
const cursor1 = first.pagination?.nextCursor;
assert(typeof cursor1 === "string" && cursor1.length > 0, "Strength page 1 must expose a continuation cursor.");

const second = await fetchPage("en", cursor1);
assert(second.data.length === PAGE_SIZE, "Strength page 2 must contain another 50 activities.");
const cursor2 = second.pagination?.nextCursor;
assert(typeof cursor2 === "string" && cursor2.length > 0, "Strength page 2 must continue beyond 100 activities.");

const firstTwoIdentities = new Set();
for (const activity of [...first.data, ...second.data]) {
  const identity = `${activity?.id ?? ""}:${activity?.revisionId ?? ""}`;
  assert(activity?.id && activity?.revisionId, "Strength activity is missing canonical identity.");
  assert(!firstTwoIdentities.has(identity), `Duplicate Strength identity across first two pages: ${identity}`);
  firstTwoIdentities.add(identity);
}
assert(firstTwoIdentities.size === 100, "Strength first two pages must contain 100 unique canonical identities.");

const allIdentities = new Set(first.data.map((activity) => `${activity.id}:${activity.revisionId}`));
let pageCount = 1;
let cursor = cursor1;
while (cursor !== null) {
  assert(pageCount < MAX_PAGES, "Strength pagination exceeded the bounded live-acceptance page limit.");
  const page = pageCount === 1 ? second : await fetchPage("en", cursor);
  for (const activity of page.data) {
    const identity = `${activity?.id ?? ""}:${activity?.revisionId ?? ""}`;
    assert(activity?.id && activity?.revisionId, "Strength activity is missing canonical identity.");
    assert(!allIdentities.has(identity), `Duplicate Strength identity during full traversal: ${identity}`);
    allIdentities.add(identity);
  }
  cursor = page.pagination?.nextCursor ?? null;
  pageCount += 1;
}
assert(allIdentities.size === EXPECTED_STRENGTH_COUNT, `Expected ${EXPECTED_STRENGTH_COUNT} unique Strength identities, received ${allIdentities.size}.`);

for (const locale of ["de", "ar"]) {
  const localized = await fetchPage(locale);
  assert(localized.data.length === PAGE_SIZE, `Strength ${locale} page 1 must contain 50 activities.`);
  assert(typeof localized.pagination?.nextCursor === "string" && localized.pagination.nextCursor.length > 0, `Strength ${locale} must continue beyond page 1.`);
}

const evidence = {
  status: "pass",
  gate: "P10F-RUNTIME-CUTOVER-LIVE",
  configuredBaseOrigin: configuredOrigin.origin,
  effectiveBaseOrigin: baseUrl.origin,
  staleCustomOriginBypassed: configuredOrigin.origin === RETIRED_CUSTOM_ORIGIN,
  pageSize: PAGE_SIZE,
  page1: { returned: first.data.length, nextCursorPresent: true },
  page2: { returned: second.data.length, runningUniqueTotal: 100, nextCursorPresent: true },
  fullStrength: { uniqueIdentities: allIdentities.size, duplicates: 0, terminalCursor: null, pages: pageCount },
  locales: { en: "pass", de: "pass", ar: "pass" },
  libraryRelease: EXPECTED_LIBRARY_RELEASE,
  catalogRelease: EXPECTED_CATALOG_RELEASE,
  credentialExposed: false
};

const output = process.env.RUNNER_TEMP ? `${process.env.RUNNER_TEMP}/p10f-runtime-cutover-live.json` : "p10f-runtime-cutover-live.json";
fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence));
