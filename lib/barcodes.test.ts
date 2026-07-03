import { describe, expect, it } from "vitest";
import { barcodeValidationMessage, normalizeProductBarcode } from "@/lib/barcodes";

describe("product barcode validation", () => {
  it("accepts valid EAN-13 and UPC-A values", () => {
    expect(normalizeProductBarcode("4006381333931")).toBe("4006381333931");
    expect(normalizeProductBarcode("0 36000 29145 2")).toBe("036000291452");
  });

  it("rejects unsupported lengths and invalid check digits", () => {
    expect(normalizeProductBarcode("12345")).toBeNull();
    expect(normalizeProductBarcode("4006381333932")).toBeNull();
    expect(barcodeValidationMessage("4006381333932")).toContain("check digit");
  });
});
