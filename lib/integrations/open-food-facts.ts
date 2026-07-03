export type NormalizedFood = {
  source: string;
  source_id?: string;
  barcode?: string;
  name: string;
  brand?: string;
  serving_size?: string;
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  fiber?: number | null;
  sugar?: number | null;
  sodium?: number | null;
  raw_data?: unknown;
};
import { barcodeValidationMessage, normalizeProductBarcode } from "@/lib/barcodes";

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeOpenFoodFactsProduct(product: any, barcode: string): NormalizedFood {
  const nutriments = product?.nutriments ?? {};
  return {
    source: "open_food_facts",
    source_id: product?.code ?? barcode,
    barcode,
    name: product?.product_name || product?.generic_name || "Unnamed packaged food",
    brand: product?.brands || undefined,
    serving_size: product?.serving_size || undefined,
    calories: numberValue(nutriments["energy-kcal_serving"] ?? nutriments["energy-kcal_100g"]),
    protein: numberValue(nutriments.proteins_serving ?? nutriments.proteins_100g),
    carbs: numberValue(nutriments.carbohydrates_serving ?? nutriments.carbohydrates_100g),
    fat: numberValue(nutriments.fat_serving ?? nutriments.fat_100g),
    fiber: numberValue(nutriments.fiber_serving ?? nutriments.fiber_100g),
    sugar: numberValue(nutriments.sugars_serving ?? nutriments.sugars_100g),
    sodium: numberValue(nutriments.sodium_serving ?? nutriments.sodium_100g),
    raw_data: product
  };
}

export async function lookupOpenFoodFactsBarcode(barcode: string) {
  const normalizedBarcode = normalizeProductBarcode(barcode);
  if (!normalizedBarcode) throw new Error(barcodeValidationMessage(barcode));
  const response = await fetch(
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(normalizedBarcode)}.json?fields=code,product_name,generic_name,brands,serving_size,nutriments`,
    { headers: { "User-Agent": "Plaivra/1.0" } }
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.status === 0 || !data.product) {
    throw new Error("No Open Food Facts product was found for that barcode.");
  }
  return normalizeOpenFoodFactsProduct(data.product, normalizedBarcode);
}
