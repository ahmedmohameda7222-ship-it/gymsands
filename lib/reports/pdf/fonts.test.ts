import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import fontkit from "@pdf-lib/fontkit";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import {
  embedReportFonts,
  REPORT_FONT_URLS,
  reportFontForCodePoint,
  reportFontSupports,
} from "@/lib/reports/pdf/fonts";

describe("P8A package-managed report fonts", () => {
  it("embeds local regular and bold Latin/Arabic fonts with required coverage", async () => {
    const document = await PDFDocument.create();
    const fonts = await embedReportFonts(document);

    for (const character of ["A", "ä", "ß", "8", "×"]) {
      expect(reportFontSupports(fonts.regular.latin, character.codePointAt(0)!)).toBe(
        true,
      );
    }
    for (const character of ["ع", "١", "٠"]) {
      expect(reportFontSupports(fonts.regular.arabic, character.codePointAt(0)!)).toBe(
        true,
      );
    }
    expect(reportFontSupports(fonts.bold.latin, "ß".codePointAt(0)!)).toBe(true);
    expect(reportFontSupports(fonts.bold.arabic, "ع".codePointAt(0)!)).toBe(true);
  });

  it("uses package authority for executable runtime and static URLs for local fonts", async () => {
    const source = await readFile("lib/reports/pdf/fonts.ts", "utf8");
    expect(source).toContain('from "@pdf-lib/fontkit"');
    expect(source).toContain('new URL("./assets/NotoSans-Regular.ttf", import.meta.url)');
    expect(source).not.toMatch(/process\.cwd|vendor\/fontkit|require\.resolve|https?:\/\//u);

    for (const assetUrl of [
      REPORT_FONT_URLS.regular.latin,
      REPORT_FONT_URLS.bold.latin,
      REPORT_FONT_URLS.regular.arabic,
      REPORT_FONT_URLS.bold.arabic,
    ]) {
      const metadata = await stat(assetUrl);
      expect(metadata.size).toBeGreaterThan(10_000);
    }
  });

  it("contains no executable runtime bundle under the PDF vendor directory", async () => {
    const vendorDirectory = path.join("lib", "reports", "pdf", "vendor");
    const entries = await readdir(vendorDirectory).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [];
      throw error;
    });
    expect(
      entries.filter((entry) => /\.(?:c?js|mjs)$/u.test(entry)),
    ).toEqual([]);
    const source = await readFile("lib/reports/pdf/text-direction.ts", "utf8");
    expect(source).toContain('from "bidi-js"');
    expect(source).not.toContain("/vendor/");
  });

  it("applies contextual Arabic shaping instead of isolated or manually reversed glyphs", async () => {
    type ShapingFont = {
      glyphForCodePoint: (codePoint: number) => { id: number };
      layout: (text: string) => { glyphs: Array<{ id: number }> };
    };
    const bytes = await readFile(REPORT_FONT_URLS.regular.arabic);
    const shapingFontkit = fontkit as Readonly<{
      create: (input: Uint8Array) => ShapingFont;
    }>;
    const font = shapingFontkit.create(bytes);
    const logical = "سلام";
    const isolated = [...logical].map(
      (character) => font.glyphForCodePoint(character.codePointAt(0)!).id,
    );
    const shaped = font.layout(logical).glyphs.map((glyph) => glyph.id);

    expect(shaped.length).toBeGreaterThan(0);
    expect(shaped.length).toBeLessThan(isolated.length);
    expect(shaped).not.toEqual(isolated);
    expect(shaped).not.toEqual([...isolated].reverse());
  });

  it("fails closed for unsupported glyphs instead of drawing replacement boxes", async () => {
    const document = await PDFDocument.create();
    const fonts = await embedReportFonts(document);
    expect(() =>
      reportFontForCodePoint(
        fonts.regular,
        "🧬".codePointAt(0)!,
        "latin",
      ),
    ).toThrowError(/cannot be rendered safely/u);
  });
});
