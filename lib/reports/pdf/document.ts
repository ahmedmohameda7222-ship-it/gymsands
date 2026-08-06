import {
  PageSizes,
  PDFDocument,
  PDFName,
  PDFString,
  type PDFPage,
  type PDFFont,
  type RGB,
  rgb,
} from "pdf-lib";

import { PdfReportError } from "@/lib/reports/pdf/errors";
import {
  reportFontForCodePoint,
  type ReportFontFamily,
  type ReportFontSet,
} from "@/lib/reports/pdf/fonts";
import { directionalTextRuns } from "@/lib/reports/pdf/text-direction";
import {
  PDF_REPORT_BOUNDS,
  type ReportDirection,
  type ReportLanguage,
} from "@/lib/reports/pdf/types";

export const PDF_COLORS = Object.freeze({
  ink: rgb(0.09, 0.12, 0.11),
  muted: rgb(0.38, 0.43, 0.41),
  green: rgb(0.05, 0.45, 0.31),
  gold: rgb(0.67, 0.49, 0.11),
  border: rgb(0.82, 0.85, 0.84),
  panel: rgb(0.96, 0.97, 0.96),
  white: rgb(1, 1, 1),
});

export const PDF_LAYOUT = Object.freeze({
  pageWidth: PageSizes.A4[0],
  pageHeight: PageSizes.A4[1],
  marginX: 44,
  contentTop: 742,
  contentBottom: 78,
  contentWidth: PageSizes.A4[0] - 88,
  headerY: 805,
  footerY: 34,
});

export type PdfTextStyle = Readonly<{
  size: number;
  bold?: boolean;
  color?: RGB;
  lineHeight?: number;
  align?: "start" | "end" | "center";
}>;

type FontRun = Readonly<{
  text: string;
  font: PDFFont;
  family: ReportFontFamily;
  width: number;
}>;

function fontRuns(
  text: string,
  fonts: Readonly<Record<ReportFontFamily, PDFFont>>,
  size: number,
  direction: ReportDirection,
): readonly FontRun[] {
  const runs: Array<{
    text: string;
    font: PDFFont;
    family: ReportFontFamily;
  }> = [];
  for (const directionalRun of directionalTextRuns(text || " ", direction)) {
    const directionalRunStart = runs.length;
    for (const character of directionalRun.text) {
      const codePoint = character.codePointAt(0);
      if (codePoint === undefined) continue;
      const current =
        runs.length > directionalRunStart ? runs[runs.length - 1] : undefined;
      const selected = reportFontForCodePoint(
        fonts,
        codePoint,
        current?.family ?? directionalRun.preferredFont,
      );
      if (current && current.font === selected.font) {
        current.text += character;
      } else {
        runs.push({
          text: character,
          font: selected.font,
          family: selected.family,
        });
      }
    }
  }
  return runs.map((run) => ({
    ...run,
    width: run.font.widthOfTextAtSize(run.text, size),
  }));
}

function lineWidth(
  text: string,
  fonts: Readonly<Record<ReportFontFamily, PDFFont>>,
  size: number,
  direction: ReportDirection,
) {
  return fontRuns(text, fonts, size, direction).reduce(
    (total, run) => total + run.width,
    0,
  );
}

export class PdfReportComposer {
  readonly document: PDFDocument;
  readonly language: ReportLanguage;
  readonly direction: ReportDirection;
  readonly fonts: ReportFontSet;
  private readonly pages: PDFPage[] = [];
  private page!: PDFPage;
  private cursorY: number = PDF_LAYOUT.contentTop;
  private readonly reportLabel: string;

  constructor(input: Readonly<{
    document: PDFDocument;
    language: ReportLanguage;
    direction: ReportDirection;
    fonts: ReportFontSet;
    reportLabel: string;
  }>) {
    this.document = input.document;
    this.language = input.language;
    this.direction = input.direction;
    this.fonts = input.fonts;
    this.reportLabel = input.reportLabel;
    this.page = this.addPage();
  }

  get pageCount() {
    return this.pages.length;
  }

  get y() {
    return this.cursorY;
  }

  set y(value: number) {
    this.cursorY = value;
  }

  private addPage() {
    if (this.pages.length >= PDF_REPORT_BOUNDS.maxPages) {
      throw new PdfReportError(
        "REPORT_TOO_LARGE",
        "The report exceeds the maximum page count.",
      );
    }
    const page = this.document.addPage(PageSizes.A4);
    this.pages.push(page);
    this.page = page;
    this.cursorY = PDF_LAYOUT.contentTop;
    this.drawHeader(page);
    return page;
  }

  private drawHeader(page: PDFPage) {
    const logoSize = 24;
    const rtl = this.direction === "rtl";
    const logoX = rtl
      ? PDF_LAYOUT.pageWidth - PDF_LAYOUT.marginX - logoSize
      : PDF_LAYOUT.marginX;
    page.drawRectangle({
      x: logoX,
      y: PDF_LAYOUT.headerY - logoSize + 2,
      width: logoSize,
      height: logoSize,
      color: PDF_COLORS.green,
      borderColor: PDF_COLORS.green,
      borderWidth: 0.8,
    });
    this.drawTextOnPage(page, "P", {
      x: logoX,
      y: PDF_LAYOUT.headerY - 15,
      maxWidth: logoSize,
      style: {
        size: 13,
        bold: true,
        color: PDF_COLORS.white,
        align: "center",
      },
    });
    this.drawTextOnPage(page, "Plaivra", {
      x: rtl ? logoX - 96 : logoX + 32,
      y: PDF_LAYOUT.headerY - 13,
      maxWidth: 90,
      style: {
        size: 10.5,
        bold: true,
        color: PDF_COLORS.ink,
        align: rtl ? "end" : "start",
      },
    });
    this.drawTextOnPage(page, this.reportLabel, {
      x: rtl ? PDF_LAYOUT.marginX : PDF_LAYOUT.marginX + 128,
      y: PDF_LAYOUT.headerY - 13,
      maxWidth: PDF_LAYOUT.contentWidth - 128,
      style: {
        size: 10,
        bold: true,
        color: PDF_COLORS.green,
        align: rtl ? "start" : "end",
      },
    });
    page.drawLine({
      start: { x: PDF_LAYOUT.marginX, y: PDF_LAYOUT.headerY - 34 },
      end: {
        x: PDF_LAYOUT.pageWidth - PDF_LAYOUT.marginX,
        y: PDF_LAYOUT.headerY - 34,
      },
      thickness: 0.8,
      color: PDF_COLORS.border,
    });
  }

  hasSpace(height: number) {
    return this.cursorY - height >= PDF_LAYOUT.contentBottom;
  }

  newPage() {
    this.addPage();
  }

  ensureSpace(height: number) {
    if (height > PDF_LAYOUT.contentTop - PDF_LAYOUT.contentBottom) {
      throw new PdfReportError(
        "REPORT_TOO_LARGE",
        "A report block exceeds the page content area.",
      );
    }
    const moved = !this.hasSpace(height);
    if (moved) this.addPage();
    return moved;
  }

  gap(points: number) {
    this.cursorY -= points;
  }

  rule(color: RGB = PDF_COLORS.border) {
    this.ensureSpace(8);
    this.page.drawLine({
      start: { x: PDF_LAYOUT.marginX, y: this.cursorY },
      end: {
        x: PDF_LAYOUT.pageWidth - PDF_LAYOUT.marginX,
        y: this.cursorY,
      },
      thickness: 0.75,
      color,
    });
    this.cursorY -= 8;
  }

  box(height: number, color: RGB = PDF_COLORS.panel) {
    this.ensureSpace(height);
    this.page.drawRectangle({
      x: PDF_LAYOUT.marginX,
      y: this.cursorY - height,
      width: PDF_LAYOUT.contentWidth,
      height,
      color,
      borderColor: PDF_COLORS.border,
      borderWidth: 0.6,
    });
  }

  sectionHeading(text: string, keepWithHeight = 28) {
    this.ensureSpace(keepWithHeight);
    this.drawText(text, {
      size: 13,
      bold: true,
      color: PDF_COLORS.green,
    });
    this.gap(4);
  }

  drawText(text: string, style: PdfTextStyle) {
    const lines = this.wrap(text, PDF_LAYOUT.contentWidth, style);
    const lineHeight = style.lineHeight ?? style.size * 1.35;
    this.ensureSpace(lines.length * lineHeight);
    for (const line of lines) {
      this.drawTextOnPage(this.page, line, {
        x: PDF_LAYOUT.marginX,
        y: this.cursorY - style.size,
        maxWidth: PDF_LAYOUT.contentWidth,
        style,
      });
      this.cursorY -= lineHeight;
    }
  }

  drawTextAt(
    text: string,
    input: Readonly<{
      x: number;
      y: number;
      maxWidth: number;
      style: PdfTextStyle;
    }>,
  ) {
    this.drawTextOnPage(this.page, text, input);
  }

  wrappedHeight(text: string, maxWidth: number, style: PdfTextStyle) {
    const lineHeight = style.lineHeight ?? style.size * 1.35;
    return this.wrap(text, maxWidth, style).length * lineHeight;
  }

  drawWrappedAt(
    text: string,
    input: Readonly<{
      x: number;
      y: number;
      maxWidth: number;
      style: PdfTextStyle;
    }>,
  ) {
    const lines = this.wrap(text, input.maxWidth, input.style);
    const lineHeight = input.style.lineHeight ?? input.style.size * 1.35;
    let y = input.y;
    for (const line of lines) {
      this.drawTextOnPage(this.page, line, { ...input, y });
      y -= lineHeight;
    }
    return lines.length * lineHeight;
  }

  private wrap(text: string, maxWidth: number, style: PdfTextStyle): string[] {
    const fonts = style.bold ? this.fonts.bold : this.fonts.regular;
    const paragraphs = text.replace(/\r\n?/gu, "\n").split("\n");
    const lines: string[] = [];
    for (const paragraph of paragraphs) {
      if (!paragraph) {
        lines.push("");
        continue;
      }
      const words = paragraph.split(/\s+/u);
      let current = "";
      for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (lineWidth(candidate, fonts, style.size, this.direction) <= maxWidth) {
          current = candidate;
          continue;
        }
        if (current) lines.push(current);
        current = "";
        let fragment = "";
        for (const character of word) {
          const next = `${fragment}${character}`;
          if (
            fragment &&
            lineWidth(next, fonts, style.size, this.direction) > maxWidth
          ) {
            lines.push(fragment);
            fragment = character;
          } else {
            fragment = next;
          }
        }
        current = fragment;
      }
      if (current) lines.push(current);
    }
    return lines.length ? lines : [""];
  }

  private drawTextOnPage(
    page: PDFPage,
    text: string,
    input: Readonly<{
      x: number;
      y: number;
      maxWidth: number;
      style: PdfTextStyle;
    }>,
  ) {
    const fonts = input.style.bold ? this.fonts.bold : this.fonts.regular;
    const runs = fontRuns(text || " ", fonts, input.style.size, this.direction);
    const totalWidth = runs.reduce((total, run) => total + run.width, 0);
    const alignment =
      input.style.align ?? (this.direction === "rtl" ? "end" : "start");
    let x = input.x;
    if (alignment === "end") x += Math.max(0, input.maxWidth - totalWidth);
    if (alignment === "center") {
      x += Math.max(0, (input.maxWidth - totalWidth) / 2);
    }
    for (const run of runs) {
      page.drawText(run.text, {
        x,
        y: input.y,
        size: input.style.size,
        font: run.font,
        color: input.style.color ?? PDF_COLORS.ink,
      });
      x += run.width;
    }
  }

  drawFooters(
    input: Readonly<{
      pageLabel: string;
      ofLabel: string;
      privateReminder: string;
      generatedLabel: string;
      generatedValue: string;
      tagline: string;
    }>,
  ) {
    const rtl = this.direction === "rtl";
    const wideWidth = PDF_LAYOUT.contentWidth * 0.62;
    const narrowWidth = PDF_LAYOUT.contentWidth * 0.34;
    const rightNarrowX = PDF_LAYOUT.marginX + PDF_LAYOUT.contentWidth * 0.66;
    this.pages.forEach((page, index) => {
      page.drawLine({
        start: { x: PDF_LAYOUT.marginX, y: PDF_LAYOUT.footerY + 24 },
        end: {
          x: PDF_LAYOUT.pageWidth - PDF_LAYOUT.marginX,
          y: PDF_LAYOUT.footerY + 24,
        },
        thickness: 0.6,
        color: PDF_COLORS.border,
      });
      this.drawTextOnPage(page, input.privateReminder, {
        x: rtl ? PDF_LAYOUT.marginX + PDF_LAYOUT.contentWidth * 0.38 : PDF_LAYOUT.marginX,
        y: PDF_LAYOUT.footerY + 8,
        maxWidth: wideWidth,
        style: {
          size: 7.2,
          color: PDF_COLORS.muted,
          align: rtl ? "end" : "start",
        },
      });
      this.drawTextOnPage(
        page,
        `${input.pageLabel} ${index + 1} ${input.ofLabel} ${this.pages.length}`,
        {
          x: rtl ? PDF_LAYOUT.marginX : rightNarrowX,
          y: PDF_LAYOUT.footerY + 8,
          maxWidth: narrowWidth,
          style: {
            size: 7.5,
            bold: true,
            color: PDF_COLORS.muted,
            align: rtl ? "start" : "end",
          },
        },
      );
      this.drawTextOnPage(
        page,
        `${input.generatedLabel}: ${input.generatedValue}`,
        {
          x: rtl ? PDF_LAYOUT.marginX + PDF_LAYOUT.contentWidth * 0.38 : PDF_LAYOUT.marginX,
          y: PDF_LAYOUT.footerY - 5,
          maxWidth: wideWidth,
          style: {
            size: 6.8,
            color: PDF_COLORS.muted,
            align: rtl ? "end" : "start",
          },
        },
      );
      this.drawTextOnPage(page, input.tagline, {
        x: rtl ? PDF_LAYOUT.marginX : rightNarrowX,
        y: PDF_LAYOUT.footerY - 5,
        maxWidth: narrowWidth,
        style: {
          size: 6.8,
          color: PDF_COLORS.muted,
          align: rtl ? "start" : "end",
        },
      });
    });
  }

}

export function setPdfLanguage(document: PDFDocument, language: ReportLanguage) {
  document.catalog.set(PDFName.of("Lang"), PDFString.of(language));
}
