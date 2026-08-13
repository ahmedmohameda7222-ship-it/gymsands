import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const MAIN_PREVIEW_BRANCH = "feat/p10f-activity-catalog-v2-cutover";
const EXPECTED_CATALOG_HEAD = "d5c6bb458a1e9310d9d11aab58099eef68d56c61";
const CATALOG_PREVIEW_ORIGIN = "https://plaivra-activity-catalog-api-git-fe-211ae7-ahmed-s-projectssasa.vercel.app";
const EXPECTED_LIBRARY_RELEASE_ID = "e6dc6eaf-aba2-5be5-b089-331aeee4f023";
const EXPECTED_LIBRARY_RELEASE_VERSION = "p10e-library-v1-c1";
const EXPECTED_LIBRARY_RELEASE_CHECKSUM = "7a53113b410cb6fb6d8846eaf6a356e06df09b502a573738990c225c83a095b4";
const EXPECTED_CATALOG_RELEASE_ID = "fc92eca8-c2ab-5366-ba83-5c64c904aaca";
const EXPECTED_CATALOG_RELEASE_VERSION = "p10e-library-v1";
const EXPECTED_CATALOG_RELEASE_CHECKSUM = "a3f4707871d41efa50de8e56d7760dc06c45765aa35ac4c42f179186176c5271";
const EXPECTED_STRENGTH_FINGERPRINT = "73092422c4ef3bb6f386b7081fdeaaacb65778a29d449ba42fa2dda8fd9d142a";
const EXPECTED_DOMAINS = [
  "calisthenics",
  "cardio_conditioning",
  "cycling",
  "general_home",
  "mobility",
  "pilates",
  "running",
  "strength",
  "swimming",
  "yoga"
];
const KNOWN_STRENGTH_SLUG = "barbell_bench_press";
const SHARED_ACTIVITY_ID = "0fa14d4c-d2ed-5100-aa1e-a3bb13a5b7da";
const sha = /^[0-9a-f]{40}$/;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const isP10fPreview = process.env.VERCEL_ENV === "preview"
  && process.env.VERCEL_GIT_COMMIT_REF === MAIN_PREVIEW_BRANCH;

if (!isP10fPreview) {
  console.log("P10F Preview-to-Preview verification not required for this build.");
  process.exit(0);
}

const mainHead = process.env.VERCEL_GIT_COMMIT_SHA ?? "";
assert(sha.test(mainHead), "P10F Main Preview exact commit SHA is unavailable.");

const apiKey = process.env.PLAIVRA_ACTIVITY_CATALOG_API_KEY ?? "";
assert(apiKey.length >= 20, "P10F Main Preview requires the server-only Catalog API key.");
assert(!process.env.NEXT_PUBLIC_PLAIVRA_ACTIVITY_CATALOG_API_KEY, "Catalog API key must never exist in a NEXT_PUBLIC environment variable.");

function assertNoSensitive(value) {
  const serialized = JSON.stringify(value ?? {}).toLowerCase();
  const forbidden = [
    apiKey.toLowerCase(),
    "service_role",
    "supabase_secret_key",
    "database password",
    "postgres://",
    "postgresql://"
  ];
  for (const token of forbidden) {
    if (token) assert(!serialized.includes(token), `Catalog Preview leaked sensitive token: ${token.slice(0, 12)}`);
  }
}

function assertLibraryAuthority(payload) {
  const meta = payload?.meta ?? {};
  assert(meta.libraryRelease?.id === EXPECTED_LIBRARY_RELEASE_ID, "Catalog Preview Library release ID drifted.");
  assert(meta.libraryRelease?.version === EXPECTED_LIBRARY_RELEASE_VERSION, "Catalog Preview Library release version drifted.");
  assert(meta.libraryRelease?.checksum === EXPECTED_LIBRARY_RELEASE_CHECKSUM, "Catalog Preview Library checksum drifted.");
  assert(meta.libraryRelease?.strengthSemanticFingerprint === EXPECTED_STRENGTH_FINGERPRINT, "Catalog Preview Strength semantic fingerprint drifted.");
  assert(meta.catalogRelease?.id === EXPECTED_CATALOG_RELEASE_ID, "Catalog Preview Catalog release ID drifted.");
  assert(meta.catalogRelease?.version === EXPECTED_CATALOG_RELEASE_VERSION, "Catalog Preview Catalog release version drifted.");
  assert(meta.catalogRelease?.checksum === EXPECTED_CATALOG_RELEASE_CHECKSUM, "Catalog Preview Catalog checksum drifted.");
}

async function requestJson(pathname, { authenticated = true } = {}) {
  const url = new URL(pathname, CATALOG_PREVIEW_ORIGIN);
  for (const key of url.searchParams.keys()) {
    assert(!/user|email|account|profile/i.test(key), `User-owned query parameter must not be sent upstream: ${key}`);
  }
  const headers = { Accept: "application/json" };
  if (authenticated) headers.Authorization = `Bearer ${apiKey}`;
  assert(Object.keys(headers).every((key) => key === "Accept" || key === "Authorization"), "Unexpected upstream header detected.");
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
    headers
  });
  const payload = await response.json().catch(() => null);
  assertNoSensitive(payload);
  return { response, payload };
}

function collectFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(full));
    else if (/\.(?:js|jsx|mjs|ts|tsx)$/.test(entry.name)) files.push(full);
  }
  return files;
}

function proveBrowserSecretBoundary() {
  const candidates = ["app", "components", "hooks"].flatMap(collectFiles);
  for (const file of candidates) {
    const source = fs.readFileSync(file, "utf8");
    if (!/^\s*["']use client["'];/m.test(source)) continue;
    assert(!source.includes(CATALOG_PREVIEW_ORIGIN), `Client module contains direct Catalog Preview origin: ${file}`);
    assert(!source.includes("PLAIVRA_ACTIVITY_CATALOG_API_KEY"), `Client module references Catalog API secret: ${file}`);
    assert(!source.includes("NEXT_PUBLIC_PLAIVRA_ACTIVITY_CATALOG_API_KEY"), `Client module references a public Catalog key: ${file}`);
  }
}

proveBrowserSecretBoundary();

const unauthenticatedHealth = await requestJson("/v2/health", { authenticated: false });
assert(unauthenticatedHealth.response.status === 401, "Unauthenticated Catalog health must fail closed with 401.");
assert(unauthenticatedHealth.payload?.error?.code === "unauthorized", "Unauthenticated Catalog health returned the wrong error code.");

const wrongAuth = await fetch(new URL("/v2/health", CATALOG_PREVIEW_ORIGIN), {
  method: "GET",
  cache: "no-store",
  signal: AbortSignal.timeout(12_000),
  headers: { Accept: "application/json", Authorization: "Bearer p10f-intentionally-invalid-preview-key" }
});
assert(wrongAuth.status === 401, "Invalid Catalog bearer credential must fail closed with 401.");

const health = await requestJson("/v2/health");
assert(health.response.ok, `Catalog Preview health returned HTTP ${health.response.status}.`);
assert(health.payload?.data?.status === "ok" && health.payload?.data?.releaseAvailable === true, "Catalog Preview health is not release-ready.");
assert(health.payload?.meta?.release?.id === EXPECTED_CATALOG_RELEASE_ID, "Catalog health release ID drifted.");
assert(health.payload?.meta?.release?.version === EXPECTED_CATALOG_RELEASE_VERSION, "Catalog health release version drifted.");
assert(health.payload?.meta?.release?.checksum === EXPECTED_CATALOG_RELEASE_CHECKSUM, "Catalog health release checksum drifted.");

const domains = await requestJson("/v2/library-domains?locale=en");
assert(domains.response.ok, `Library domain list returned HTTP ${domains.response.status}.`);
assertLibraryAuthority(domains.payload);
const domainKeys = (domains.payload?.data ?? []).map((item) => item?.key).sort();
assert(JSON.stringify(domainKeys) === JSON.stringify(EXPECTED_DOMAINS), `Library domain authority drifted: ${domainKeys.join(",")}`);
assert(!domainKeys.includes("crossfit") && !domainKeys.includes("martial_arts"), "Forbidden Library domain became active.");

const page1 = await requestJson("/v2/library-domains/strength/activities?locale=en&limit=8");
assert(page1.response.ok, `Strength search returned HTTP ${page1.response.status}.`);
assertLibraryAuthority(page1.payload);
assert(Array.isArray(page1.payload?.data) && page1.payload.data.length === 8, "Strength search returned unexpected page size.");
const cursor = page1.payload?.pagination?.nextCursor;
assert(typeof cursor === "string" && cursor.length > 20, "Strength cursor continuation is missing.");
const page1Ids = new Set(page1.payload.data.map((item) => `${item.id}:${item.revisionId}`));
assert(page1Ids.size === page1.payload.data.length, "Duplicate identities exist inside the first Strength page.");

const page2 = await requestJson(`/v2/library-domains/strength/activities?locale=en&limit=8&cursor=${encodeURIComponent(cursor)}`);
assert(page2.response.ok, `Strength cursor continuation returned HTTP ${page2.response.status}.`);
assertLibraryAuthority(page2.payload);
assert(Array.isArray(page2.payload?.data) && page2.payload.data.length > 0, "Strength cursor continuation returned no data.");
for (const item of page2.payload.data) {
  assert(!page1Ids.has(`${item.id}:${item.revisionId}`), "Cursor continuation repeated an activity identity.");
}

const candidate = page1.payload.data[0];
assert(candidate?.id && candidate?.revisionId && candidate?.slug, "Strength candidate identity is incomplete.");
const resolved = [];
for (const identifier of [candidate.slug, candidate.id, candidate.revisionId]) {
  const detail = await requestJson(`/v2/library-domains/strength/activities/${encodeURIComponent(identifier)}?locale=en`);
  assert(detail.response.ok, `Strength detail failed for identifier ${identifier}.`);
  assertLibraryAuthority(detail.payload);
  assert(detail.payload?.data?.id === candidate.id, `Activity ID resolution drifted for ${identifier}.`);
  assert(detail.payload?.data?.revisionId === candidate.revisionId, `Revision ID resolution drifted for ${identifier}.`);
  assert(detail.payload?.data?.slug === candidate.slug, `Slug resolution drifted for ${identifier}.`);
  resolved.push(detail.payload.data);
}
assert(resolved.every((item) => item.id === resolved[0].id && item.revisionId === resolved[0].revisionId), "Stable identifiers do not converge on one release-bound identity.");

const known = {};
for (const locale of ["en", "de", "ar"]) {
  const detail = await requestJson(`/v2/library-domains/strength/activities/${KNOWN_STRENGTH_SLUG}?locale=${locale}`);
  assert(detail.response.ok, `${locale} Strength localization detail failed.`);
  assertLibraryAuthority(detail.payload);
  known[locale] = detail.payload.data;
}
assert(known.en?.name === "Barbell Bench Press", "Known English Strength authority drifted.");
assert(typeof known.de?.name === "string" && known.de.name.toLowerCase() !== known.en.name.toLowerCase(), "German Strength localization fell back to English.");
assert(/[ء-ي]/.test(known.ar?.name ?? ""), "Arabic Strength localization is not Arabic.");

for (const locale of ["de", "ar"]) {
  const localized = known[locale].name;
  const search = await requestJson(`/v2/library-domains/strength/activities?locale=${locale}&query=${encodeURIComponent(localized)}&limit=10`);
  assert(search.response.ok, `${locale} localized search failed.`);
  assertLibraryAuthority(search.payload);
  assert(search.payload.data.some((item) => item.slug === KNOWN_STRENGTH_SLUG), `${locale} localized search missed the known Strength activity.`);
}

const alias = (known.en?.aliases ?? []).find((entry) => typeof entry?.text === "string" && entry.text.trim() && entry.text.toLowerCase() !== known.en.name.toLowerCase());
if (alias) {
  const aliasSearch = await requestJson(`/v2/library-domains/strength/activities?locale=en&query=${encodeURIComponent(alias.text)}&limit=10`);
  assert(aliasSearch.response.ok, "Alias search failed.");
  assert(aliasSearch.payload.data.some((item) => item.slug === KNOWN_STRENGTH_SLUG), "Alias search did not resolve the known Strength identity.");
}

const zeroResult = await requestJson("/v2/library-domains/strength/activities?locale=en&query=zzzz_p10f_no_match_zzzz&limit=10");
assert(zeroResult.response.ok, "Legitimate zero-result search failed.");
assert(Array.isArray(zeroResult.payload?.data) && zeroResult.payload.data.length === 0, "Legitimate zero-result search must remain empty.");

const alternativeChecks = await Promise.all(page1.payload.data.map(async (item) => {
  const result = await requestJson(`/v2/library-domains/strength/activities/${item.revisionId}/alternatives?locale=en&limit=6`);
  assert(result.response.ok, `Alternatives failed for ${item.slug}.`);
  assertLibraryAuthority(result.payload);
  assert(Array.isArray(result.payload?.data), `Alternatives envelope is invalid for ${item.slug}.`);
  return { item, result };
}));
const nonEmptyAlternative = alternativeChecks.find(({ result }) => result.payload.data.length > 0);
const emptyAlternative = alternativeChecks.find(({ result }) => result.payload.data.length === 0);
assert(nonEmptyAlternative, "No representative non-empty authoritative alternative set was proven.");
assert(emptyAlternative, "No legitimate empty authoritative alternative result was proven.");

const running = await requestJson("/v2/library-domains/running/activities?locale=en&limit=1");
assert(running.response.ok && running.payload?.data?.length === 1, "Generic Running Library retrieval failed.");
assertLibraryAuthority(running.payload);
const runningDetail = await requestJson(`/v2/library-domains/running/activities/${running.payload.data[0].revisionId}?locale=en`);
assert(runningDetail.response.ok, "Generic Running detail failed.");
assertLibraryAuthority(runningDetail.payload);

const sharedStrength = await requestJson(`/v2/library-domains/strength/activities/${SHARED_ACTIVITY_ID}?locale=de`);
const sharedHome = await requestJson(`/v2/library-domains/general_home/activities/${SHARED_ACTIVITY_ID}?locale=de`);
assert(sharedStrength.response.ok && sharedHome.response.ok, "Shared cross-domain identity is not addressable in both approved domains.");
assertLibraryAuthority(sharedStrength.payload);
assertLibraryAuthority(sharedHome.payload);
assert(sharedStrength.payload.data?.id === SHARED_ACTIVITY_ID && sharedHome.payload.data?.id === SHARED_ACTIVITY_ID, "Shared activity ID drifted.");
assert(sharedStrength.payload.data?.revisionId === sharedHome.payload.data?.revisionId, "Shared cross-domain revision identity drifted.");

const strengthOnlyPage = await requestJson("/v2/library-domains/strength/activities?locale=en&limit=30");
const homeChecks = await Promise.all(strengthOnlyPage.payload.data.map(async (item) => {
  const result = await requestJson(`/v2/library-domains/general_home/activities/${item.id}?locale=en`);
  return { item, status: result.response.status };
}));
const strengthOnly = homeChecks.find(({ status }) => status === 404);
assert(strengthOnly, "No representative Strength-only identity was proven against General/Home.");

const wrongDomain = await requestJson(`/v2/library-domains/running/activities/${candidate.revisionId}?locale=en`);
assert(wrongDomain.response.status === 404 && wrongDomain.payload?.error?.code === "activity_not_found", "Wrong-domain identity must fail closed with activity_not_found.");

const invalidLocale = await requestJson("/v2/library-domains/strength/activities?locale=tr&limit=1");
assert(invalidLocale.response.status === 400 && invalidLocale.payload?.error?.code === "invalid_locale", "Library Turkish locale must fail with invalid_locale.");
const invalidCursor = await requestJson("/v2/library-domains/strength/activities?locale=en&limit=1&cursor=not-a-valid-cursor");
assert(invalidCursor.response.status === 400 && invalidCursor.payload?.error?.code === "invalid_cursor", "Tampered cursor must fail with invalid_cursor.");
const invalidQuery = await requestJson("/v2/library-domains/strength/activities?locale=en&unsupported=p10f");
assert(invalidQuery.response.status === 400 && invalidQuery.payload?.error?.code === "invalid_filter", "Unsupported query parameter must fail with invalid_filter.");

console.log(JSON.stringify({
  status: "pass",
  gate: "P10F-PREVIEW-TO-PREVIEW",
  mainBranch: MAIN_PREVIEW_BRANCH,
  mainHead,
  catalogHead: EXPECTED_CATALOG_HEAD,
  catalogPreviewOrigin: CATALOG_PREVIEW_ORIGIN,
  libraryReleaseId: EXPECTED_LIBRARY_RELEASE_ID,
  libraryReleaseVersion: EXPECTED_LIBRARY_RELEASE_VERSION,
  libraryReleaseChecksum: EXPECTED_LIBRARY_RELEASE_CHECKSUM,
  catalogReleaseId: EXPECTED_CATALOG_RELEASE_ID,
  catalogReleaseChecksum: EXPECTED_CATALOG_RELEASE_CHECKSUM,
  domains: domainKeys.length,
  cursorContinuation: true,
  stableDetailIdentifiers: ["slug", "activity_id", "revision_id"],
  locales: ["en", "de", "ar"],
  localizedSearch: ["de", "ar"],
  aliasSearch: Boolean(alias),
  nonEmptyAlternatives: nonEmptyAlternative.item.slug,
  emptyAlternatives: emptyAlternative.item.slug,
  genericDomain: running.payload.data[0].slug,
  sharedIdentity: SHARED_ACTIVITY_ID,
  strengthOnlyIdentity: strengthOnly.item.id,
  duplicateIdentities: 0,
  unauthenticatedStatus: unauthenticatedHealth.response.status,
  invalidBearerStatus: wrongAuth.status,
  strictBadRequests: true,
  browserDirectCatalogCalls: 0,
  catalogSecretExposedToClient: false,
  userDataSentUpstream: false,
  fallbackFailureMatrixAuthority: "services/activity-catalog/server/library-v2-boundaries.test.ts"
}, null, 2));
