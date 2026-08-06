import { PageSizes, PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { buildWorkoutReportModel } from "@/lib/reports/workout/model";
import {
  assertWorkoutReportResultBounds,
  renderWorkoutReport,
} from "@/lib/reports/workout/render";
import { PdfReportError } from "@/lib/reports/pdf/errors";
import { PDF_REPORT_BOUNDS } from "@/lib/reports/pdf/types";
import { workoutReportFixture } from "@/lib/reports/workout/test-fixture";

const generatedAt = new Date("2026-08-06T00:00:00.000Z");

describe("P8A workout PDF renderer", () => {
  it.each(["en", "de", "ar"] as const)(
    "creates loadable, bounded, selectable-text PDF bytes for %s",
    async (language) => {
      const model = buildWorkoutReportModel({
        detail: workoutReportFixture(),
        language,
        timezone: "Europe/Berlin",
        generatedAt,
      });
      const result = await renderWorkoutReport(model);

      expect(new TextDecoder().decode(result.bytes.slice(0, 5))).toBe("%PDF-");
      expect(result.pageCount).toBeGreaterThan(0);
      expect(result.pageCount).toBeLessThanOrEqual(40);
      expect(result.byteCount).toBe(result.bytes.byteLength);
      expect(result.byteCount).toBeGreaterThan(1_000);

      const loaded = await PDFDocument.load(result.bytes);
      expect(loaded.getPageCount()).toBe(result.pageCount);
      const size = loaded.getPage(0).getSize();
      expect(size.width).toBeCloseTo(PageSizes.A4[0], 5);
      expect(size.height).toBeCloseTo(PageSizes.A4[1], 5);
      expect(loaded.getTitle()).toContain(model.title);
      expect(loaded.getAuthor()).toBe("Plaivra");
      expect(loaded.catalog.get(PDFName.of("Lang"))?.toString()).toContain(
        language,
      );
      const resources = loaded.getPage(0).node.Resources();
      const embeddedFonts = resources?.lookup(PDFName.of("Font"), PDFDict);
      expect(embeddedFonts?.keys().length ?? 0).toBeGreaterThanOrEqual(2);

      const binary = Buffer.from(result.bytes).toString("latin1");
      for (const secret of [
        "11111111-1111-4111-8111-111111111111",
        "20000000-0000-4000-8000-000000000002",
        "member-token",
        "member@example.com",
        "internal-secret",
      ]) {
        expect(binary).not.toContain(secret);
      }
    },
  );

  it("fails closed for explicit page, byte, and generation-time bounds", () => {
    for (const input of [
      {
        pageCount: PDF_REPORT_BOUNDS.maxPages + 1,
        byteCount: 1,
        generationMs: 1,
      },
      {
        pageCount: 1,
        byteCount: PDF_REPORT_BOUNDS.maxBytes + 1,
        generationMs: 1,
      },
      {
        pageCount: 1,
        byteCount: 1,
        generationMs: PDF_REPORT_BOUNDS.maxGenerationMs + 1,
      },
    ]) {
      expect(() => assertWorkoutReportResultBounds(input)).toThrowError(
        PdfReportError,
      );
      try {
        assertWorkoutReportResultBounds(input);
      } catch (error) {
        expect(error).toMatchObject({ code: "REPORT_TOO_LARGE", status: 413 });
      }
    }
  });

});
