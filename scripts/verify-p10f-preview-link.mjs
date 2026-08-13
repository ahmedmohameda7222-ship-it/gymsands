import process from "node:process";

const MAIN_PREVIEW_BRANCH = "feat/p10f-activity-catalog-v2-cutover";
const CATALOG_PREVIEW_ORIGIN = "https://plaivra-activity-catalog-api-git-fe-211ae7-ahmed-s-projectssasa.vercel.app";
const EXPECTED_LIBRARY_RELEASE_ID = "e6dc6eaf-aba2-5be5-b089-331aeee4f023";
const EXPECTED_LIBRARY_RELEASE_VERSION = "p10e-library-v1-c1";
const EXPECTED_LIBRARY_RELEASE_CHECKSUM = "7a53113b410cb6fb6d8846eaf6a356e06df09b502a573738990c225c83a095b4";
const EXPECTED_CATALOG_RELEASE_ID = "fc92eca8-c2ab-5366-ba83-5c64c904aaca";
const EXPECTED_CATALOG_RELEASE_CHECKSUM = "a3f4707871d41efa50de8e56d7760dc06c45765aa35ac4c42f179186176c5271";
const EXPECTED_STRENGTH_FINGERPRINT = "73092422c4ef3bb6f386b7081fdeaaacb65778a29d449ba42fa2dda8fd9d142a";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const isP10fPreview = process.env.VERCEL_ENV === "preview"
  && process.env.VERCEL_GIT_COMMIT_REF === MAIN_PREVIEW_BRANCH;

if (!isP10fPreview) {
  console.log("P10F Preview-to-Preview verification not required for this build.");
  process.exit(0);
}

const apiKey = process.env.PLAIVRA_ACTIVITY_CATALOG_API_KEY ?? "";
assert(apiKey.length >= 20, "P10F Main Preview requires the server-only Catalog API key.");

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 10_000);
try {
  const url = new URL("/v2/library-domains/strength/activities", CATALOG_PREVIEW_ORIGIN);
  url.searchParams.set("locale", "en");
  url.searchParams.set("limit", "1");
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    signal: controller.signal,
    headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` }
  });
  const payload = await response.json().catch(() => null);
  assert(response.ok, `Catalog Preview returned HTTP ${response.status}.`);
  assert(payload && typeof payload === "object", "Catalog Preview returned an invalid JSON envelope.");
  assert(Array.isArray(payload.data) && payload.data.length === 1, "Catalog Preview did not return the expected bounded Strength page.");
  const meta = payload.meta ?? {};
  assert(meta.libraryRelease?.id === EXPECTED_LIBRARY_RELEASE_ID, "Catalog Preview Library release ID drifted.");
  assert(meta.libraryRelease?.version === EXPECTED_LIBRARY_RELEASE_VERSION, "Catalog Preview Library release version drifted.");
  assert(meta.libraryRelease?.checksum === EXPECTED_LIBRARY_RELEASE_CHECKSUM, "Catalog Preview Library checksum drifted.");
  assert(meta.libraryRelease?.strengthSemanticFingerprint === EXPECTED_STRENGTH_FINGERPRINT, "Catalog Preview Strength semantic fingerprint drifted.");
  assert(meta.catalogRelease?.id === EXPECTED_CATALOG_RELEASE_ID, "Catalog Preview Catalog release ID drifted.");
  assert(meta.catalogRelease?.checksum === EXPECTED_CATALOG_RELEASE_CHECKSUM, "Catalog Preview Catalog checksum drifted.");
  console.log(JSON.stringify({
    status: "pass",
    gate: "P10F-PREVIEW-TO-PREVIEW",
    mainBranch: MAIN_PREVIEW_BRANCH,
    catalogPreviewOrigin: CATALOG_PREVIEW_ORIGIN,
    libraryReleaseVersion: EXPECTED_LIBRARY_RELEASE_VERSION,
    returned: payload.data.length
  }));
} finally {
  clearTimeout(timeout);
}
