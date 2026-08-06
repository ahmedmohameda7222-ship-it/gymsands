import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  containsArabic,
  directionalTextRuns,
} from "@/lib/reports/pdf/text-direction";

describe("P8A bidirectional text runs", () => {
  it("keeps Arabic run text logical while ordering mixed runs visually", () => {
    const source = "تم تنفيذ 80 kg × 8";
    const runs = directionalTextRuns(source, "rtl");

    expect(runs.length).toBeGreaterThan(1);
    for (const token of ["تم", "تنفيذ", "80", "kg", "8"]) {
      expect(runs.some((run) => run.text.includes(token))).toBe(true);
    }
    expect(runs.some((run) => run.text.includes("ذيفنت"))).toBe(false);
    expect(runs.some((run) => run.preferredFont === "arabic")).toBe(true);
    expect(runs.some((run) => run.preferredFont === "latin")).toBe(true);
  });

  it("preserves German characters in a left-to-right run", () => {
    const runs = directionalTextRuns("Überblick: Größe, Füße, Straße", "ltr");
    expect(runs.map((run) => run.text).join("")).toBe(
      "Überblick: Größe, Füße, Straße",
    );
    expect(runs.every((run) => run.direction === "ltr")).toBe(true);
  });

  it("recognizes Arabic presentation and extended blocks", () => {
    expect(containsArabic("تمرين")).toBe(true);
    expect(containsArabic("Bench Press")).toBe(false);
  });

  it.each([
    "تمرين Bench Press 80 kg × 8",
    "الأرقام ١٢٣ و 123",
    "ملاحظة عربية طويلة مع English وأرقام 80 kg × 8 للتحقق من ترتيب المقاطع",
  ])("preserves logical Arabic source text without whole-string reversal: %s", (value) => {
    const runs = directionalTextRuns(value, "rtl");
    const logicalArabicTokens = value.match(/[\u0600-\u06ff]+/gu) ?? [];
    expect(logicalArabicTokens.length).toBeGreaterThan(0);
    for (const token of logicalArabicTokens) {
      expect(runs.some((run) => run.text.includes(token))).toBe(true);
    }
  });

  it("contains no manual reversal implementation", () => {
    const source = readFileSync("lib/reports/pdf/text-direction.ts", "utf8");
    expect(source).toContain("getEmbeddingLevels");
    expect(source).toContain("getReorderedIndices");
    expect(source).not.toMatch(/\.reverse\s*\(|split\([^)]*\)\s*\.reverse/iu);
  });
});
