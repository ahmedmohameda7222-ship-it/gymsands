import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import type { PDFDocument, PDFFont } from "pdf-lib";

import { PdfReportError } from "@/lib/reports/pdf/errors";
import fontkit from "@/lib/reports/pdf/vendor/fontkit.cjs";

export type ReportFontFamily = "latin" | "arabic";
export type ReportFontWeight = "regular" | "bold";

export type ReportFontSet = Readonly<{
  regular: Readonly<Record<ReportFontFamily, PDFFont>>;
  bold: Readonly<Record<ReportFontFamily, PDFFont>>;
}>;

const FONT_FILES: Readonly<
  Record<ReportFontWeight, Readonly<Record<ReportFontFamily, string>>>
> = Object.freeze({
  regular: Object.freeze({
    latin: "NotoSans-Regular.ttf",
    arabic: "NotoSansArabic-Regular.ttf",
  }),
  bold: Object.freeze({
    latin: "NotoSans-Bold.ttf",
    arabic: "NotoSansArabic-Bold.ttf",
  }),
});

function fontPath(filename: string) {
  return path.join(
    process.cwd(),
    "lib",
    "reports",
    "pdf",
    "assets",
    filename,
  );
}

async function embed(
  document: PDFDocument,
  family: ReportFontFamily,
  weight: ReportFontWeight,
) {
  const bytes = await readFile(fontPath(FONT_FILES[weight][family]));
  return document.embedFont(bytes, {
    subset: true,
    customName: `PlaivraNoto-${family}-${weight}`,
  });
}

export async function embedReportFonts(
  document: PDFDocument,
): Promise<ReportFontSet> {
  document.registerFontkit(
    fontkit as Parameters<PDFDocument["registerFontkit"]>[0],
  );
  const [regularLatin, regularArabic, boldLatin, boldArabic] = await Promise.all([
    embed(document, "latin", "regular"),
    embed(document, "arabic", "regular"),
    embed(document, "latin", "bold"),
    embed(document, "arabic", "bold"),
  ]);
  return Object.freeze({
    regular: Object.freeze({ latin: regularLatin, arabic: regularArabic }),
    bold: Object.freeze({ latin: boldLatin, arabic: boldArabic }),
  });
}

export function reportFontSupports(font: PDFFont, codePoint: number) {
  return font.getCharacterSet().includes(codePoint);
}

export function reportFontForCodePoint(
  fonts: Readonly<Record<ReportFontFamily, PDFFont>>,
  codePoint: number,
  preferred: ReportFontFamily,
): Readonly<{ family: ReportFontFamily; font: PDFFont }> {
  if (reportFontSupports(fonts[preferred], codePoint)) {
    return { family: preferred, font: fonts[preferred] };
  }
  const fallback: ReportFontFamily = preferred === "arabic" ? "latin" : "arabic";
  if (reportFontSupports(fonts[fallback], codePoint)) {
    return { family: fallback, font: fonts[fallback] };
  }
  throw new PdfReportError(
    "REPORT_UNSUPPORTED_GLYPH",
    "The report contains a character that cannot be rendered safely.",
    422,
  );
}
