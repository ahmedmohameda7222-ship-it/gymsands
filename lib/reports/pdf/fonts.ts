import "server-only";

import { readFile } from "node:fs/promises";

import fontkit from "@pdf-lib/fontkit";
import type { PDFDocument, PDFFont } from "pdf-lib";

import { PdfReportError } from "@/lib/reports/pdf/errors";

export type ReportFontFamily = "latin" | "arabic";
export type ReportFontWeight = "regular" | "bold";

export type ReportFontSet = Readonly<{
  regular: Readonly<Record<ReportFontFamily, PDFFont>>;
  bold: Readonly<Record<ReportFontFamily, PDFFont>>;
}>;

export const REPORT_FONT_URLS = Object.freeze({
  regular: Object.freeze({
    latin: new URL("./assets/NotoSans-Regular.ttf", import.meta.url),
    arabic: new URL("./assets/NotoSansArabic-Regular.ttf", import.meta.url),
  }),
  bold: Object.freeze({
    latin: new URL("./assets/NotoSans-Bold.ttf", import.meta.url),
    arabic: new URL("./assets/NotoSansArabic-Bold.ttf", import.meta.url),
  }),
} satisfies Record<
  ReportFontWeight,
  Readonly<Record<ReportFontFamily, URL>>
>);

async function embed(
  document: PDFDocument,
  family: ReportFontFamily,
  weight: ReportFontWeight,
) {
  const bytes = await readFile(REPORT_FONT_URLS[weight][family]);
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
