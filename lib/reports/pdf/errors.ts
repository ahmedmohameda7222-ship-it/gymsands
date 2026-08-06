export type PdfReportErrorCode =
  | "REPORT_TOO_LARGE"
  | "REPORT_UNSUPPORTED_GLYPH"
  | "REPORT_GENERATION_FAILED";

export class PdfReportError extends Error {
  constructor(
    readonly code: PdfReportErrorCode,
    message: string,
    readonly status = code === "REPORT_TOO_LARGE" ? 413 : 500,
  ) {
    super(message);
    this.name = "PdfReportError";
  }
}
