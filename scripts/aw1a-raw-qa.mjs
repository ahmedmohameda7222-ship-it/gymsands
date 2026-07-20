import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.QA_BASE_URL || "http://127.0.0.1:3000";
const evidenceDir = path.resolve(process.env.QA_EVIDENCE_DIR || "quality-reports/aw1a");
const cases = [
  {
    name: "explicit-de-over-ar",
    cookie: "plaivra.language.v1=de",
    acceptLanguage: "ar",
    locale: "de",
    direction: "ltr",
    skipLink: "Zum Inhalt springen"
  },
  {
    name: "explicit-ar-over-de",
    cookie: "plaivra.language.v1=ar",
    acceptLanguage: "de",
    locale: "ar",
    direction: "rtl",
    skipLink: "الانتقال إلى المحتوى"
  },
  {
    name: "system-de-regional",
    cookie: "plaivra.language.v1=system",
    acceptLanguage: "de-DE",
    locale: "de",
    direction: "ltr",
    skipLink: "Zum Inhalt springen"
  },
  {
    name: "header-ar-regional",
    acceptLanguage: "ar-EG",
    locale: "ar",
    direction: "rtl",
    skipLink: "الانتقال إلى المحتوى"
  },
  {
    name: "unsupported-fallback",
    acceptLanguage: "fr-FR, es-ES;q=0.8",
    locale: "en",
    direction: "ltr",
    skipLink: "Skip to content"
  }
];

function attribute(html, name) {
  const match = new RegExp("<html[^>]*\\b" + name + '="([^"]+)"', "i").exec(html);
  return match?.[1] ?? null;
}

await mkdir(evidenceDir, { recursive: true });
const results = [];

for (const testCase of cases) {
  const headers = { "accept-language": testCase.acceptLanguage };
  if (testCase.cookie) headers.cookie = testCase.cookie;
  const response = await fetch(baseUrl + "/", { headers, redirect: "manual" });
  const html = await response.text();
  const observed = {
    status: response.status,
    locale: attribute(html, "lang"),
    direction: attribute(html, "dir"),
    requestLocale: attribute(html, "data-request-locale"),
    skipLinkPresent: html.includes(testCase.skipLink)
  };

  assert.equal(response.status, 200, testCase.name + " should return HTTP 200");
  assert.equal(observed.locale, testCase.locale, testCase.name + " lang mismatch");
  assert.equal(observed.direction, testCase.direction, testCase.name + " dir mismatch");
  assert.equal(observed.requestLocale, testCase.locale, testCase.name + " request locale mismatch");
  assert.equal(observed.skipLinkPresent, true, testCase.name + " skip-link mismatch");

  results.push({ ...testCase, observed, passed: true });
  await writeFile(path.join(evidenceDir, "raw-" + testCase.name + ".html"), html, "utf8");
}

const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  passed: results.every((entry) => entry.passed),
  cases: results
};
await writeFile(path.join(evidenceDir, "raw-server-qa.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
console.log("AW-1A raw server QA passed: " + results.length + " cases.");
