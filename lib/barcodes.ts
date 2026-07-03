const supportedLengths = new Set([8, 12, 13, 14]);

export function normalizeProductBarcode(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!supportedLengths.has(digits.length)) return null;
  const body = digits.slice(0, -1).split("").reverse();
  const sum = body.reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 3 : 1), 0);
  const expected = (10 - (sum % 10)) % 10;
  return expected === Number(digits.at(-1)) ? digits : null;
}

export function barcodeValidationMessage(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "Enter the numbers printed under the barcode.";
  if (!supportedLengths.has(digits.length)) return "Use a supported EAN or UPC barcode with 8, 12, 13, or 14 digits.";
  return "The barcode check digit does not match. Review the number or type it manually.";
}
