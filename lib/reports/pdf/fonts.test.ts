import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import {
  embedReportFonts,
  reportFontForCodePoint,
  reportFontSupports,
} from "@/lib/reports/pdf/fonts";
import fontkit from "@/lib/reports/pdf/vendor/fontkit.cjs";

describe("P8A local report fonts", () => {
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

  it("uses only repository-vendored runtime and font assets", async () => {
    const source = await readFile("lib/reports/pdf/fonts.ts", "utf8");
    expect(source).toContain('vendor/fontkit.cjs');
    expect(source).not.toMatch(/@fontsource|require\.resolve|https?:\/\//u);

    for (const asset of [
      "vendor/fontkit.cjs",
      "vendor/bidi.cjs",
      "assets/NotoSans-Regular.ttf",
      "assets/NotoSans-Bold.ttf",
      "assets/NotoSansArabic-Regular.ttf",
      "assets/NotoSansArabic-Bold.ttf",
    ]) {
      const metadata = await stat(path.join("lib", "reports", "pdf", asset));
      expect(metadata.size).toBeGreaterThan(10_000);
    }
  });

  it("applies contextual Arabic shaping instead of isolated or manually reversed glyphs", async () => {
    type ShapingFont = {
      glyphForCodePoint: (codePoint: number) => { id: number };
      layout: (text: string) => { glyphs: Array<{ id: number }> };
    };
    const bytes = await readFile(
      path.join(
        process.cwd(),
        "lib",
        "reports",
        "pdf",
        "assets",
        "NotoSansArabic-Regular.ttf",
      ),
    );
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
