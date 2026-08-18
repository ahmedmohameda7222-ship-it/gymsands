import { describe, expect, it } from "vitest";

import { getTrainLocaleMetadata } from "@/lib/i18n/train";
import { parseLocale } from "./_library-shared";
import { GET as getStrengthFilters } from "./library-domains/[domain]/filters/route";

const FILTERS_PATH = "/api/activity-catalog/library-domains/strength/filters";

function rawLocale(locale: string) {
  return parseLocale(new URL(`http://localhost${FILTERS_PATH}?locale=${encodeURIComponent(locale)}`));
}

describe("Exercise Library raw locale contract", () => {
  it.each([
    ["en", "en"],
    ["de", "de"],
    ["ar", "ar"]
  ] as const)("accepts Catalog language locale %s", (locale, expected) => {
    expect(rawLocale(locale)).toBe(expected);
  });

  it.each(["en-US", "de-DE"] as const)("rejects Intl locale %s at the raw API boundary", async (locale) => {
    expect(rawLocale(locale)).toBeNull();

    const response = await getStrengthFilters(
      new Request(`http://localhost${FILTERS_PATH}?locale=${encodeURIComponent(locale)}`),
      { params: Promise.resolve({ domain: "strength" }) }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "catalog_bad_request" });
  });

  it("captures the pre-fix Train Intl/API mismatch without weakening either contract", () => {
    expect(getTrainLocaleMetadata("en").locale).toBe("en-US");
    expect(getTrainLocaleMetadata("de").locale).toBe("de-DE");
    expect(getTrainLocaleMetadata("ar").locale).toBe("ar");

    expect(rawLocale(getTrainLocaleMetadata("en").locale)).toBeNull();
    expect(rawLocale(getTrainLocaleMetadata("de").locale)).toBeNull();
    expect(rawLocale(getTrainLocaleMetadata("ar").locale)).toBe("ar");
  });
});
