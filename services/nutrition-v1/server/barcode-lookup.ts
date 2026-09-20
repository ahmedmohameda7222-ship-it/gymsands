import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { barcodeValidationMessage, normalizeProductBarcode } from "@/lib/barcodes";
import type { NormalizedFood } from "@/lib/integrations/open-food-facts";
import { resolveCurrentGenerationFoodForNewUseFromSupabase, type CurrentGenerationFoodView } from "@/services/food-catalog/server/current-generation-service";
import {
  listFoodLibrary,
  type FoodLibraryCandidate,
} from "@/services/nutrition-v1/server/food-library";

export type BarcodeLookupResult =
  | { kind: "catalog"; barcode: string; food: FoodLibraryCandidate }
  | { kind: "provider_suggestion"; barcode: string; food: NormalizedFood };

function rows(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object" && !Array.isArray(row));
  }
  if (value && typeof value === "object" && !Array.isArray(value)) return [value as Record<string, unknown>];
  return [];
}

function selectedLocalizedDisplayName(
  view: CurrentGenerationFoodView,
  languageTag: string,
) {
  const selectedIds = new Set(view.selections.nameFactIds);
  const preferred = view.names.filter((name) => selectedIds.has(name.id) && name.role === "preferred_display");
  const requestedTag = languageTag.trim().toLowerCase();
  const requestedBase = requestedTag.split("-")[0] ?? requestedTag;
  const normalizedTag = (value: string) => value.trim().toLowerCase();
  const uniqueOrAmbiguous = (matches: typeof preferred) => {
    if (matches.length === 1) return matches[0]!;
    if (matches.length > 1) {
      throw new Error("Canonical barcode Food has an ambiguous selected display name.");
    }
    return null;
  };

  const exact = uniqueOrAmbiguous(preferred.filter((name) => normalizedTag(name.languageTag) === requestedTag));
  if (exact) return exact;

  if (requestedTag.includes("-")) {
    const explicitBase = uniqueOrAmbiguous(preferred.filter((name) => normalizedTag(name.languageTag) === requestedBase));
    if (explicitBase) return explicitBase;
  }

  const baseFamily = uniqueOrAmbiguous(preferred.filter((name) => normalizedTag(name.languageTag).split("-")[0] === requestedBase));
  if (baseFamily) return baseFamily;

  if (preferred.length === 1) return preferred[0]!;
  throw new Error("Canonical barcode Food has no unique selected display name.");
}

export async function resolveFoodBarcode(
  ownerSupabase: SupabaseClient,
  catalogSupabase: SupabaseClient,
  userId: string,
  rawBarcode: string,
  languageTag: string,
  providerLookup: (barcode: string) => Promise<NormalizedFood>,
): Promise<BarcodeLookupResult> {
  const barcode = normalizeProductBarcode(rawBarcode);
  if (!barcode) throw new Error(barcodeValidationMessage(rawBarcode));

  const mapped = await ownerSupabase.rpc("food_catalog_lookup_effective_barcode", {
    p_gtin: barcode,
  });
  if (mapped.error) {
    throw new Error(`Canonical barcode lookup failed. ${mapped.error.message ?? "Database request failed."}`);
  }

  const mappings = rows(mapped.data);
  if (mappings.length === 0) {
    const food = await providerLookup(barcode);
    return { kind: "provider_suggestion", barcode, food };
  }
  if (mappings.length !== 1) {
    throw new Error("Canonical barcode lookup did not resolve to exactly one Food.");
  }

  const mappedFoodId = mappings[0]?.food_id;
  if (typeof mappedFoodId !== "string" || !mappedFoodId.trim()) {
    throw new Error("Canonical barcode lookup returned an invalid Food identity.");
  }

  const view = await resolveCurrentGenerationFoodForNewUseFromSupabase(catalogSupabase, mappedFoodId);
  const selectedName = selectedLocalizedDisplayName(view, languageTag || "en");
  const page = await listFoodLibrary(ownerSupabase, userId, {
    query: selectedName.text,
    locale: selectedName.languageTag,
    marketScopeCode: null,
    limit: 20,
    scope: "all",
  });
  const exact = page.items.filter((item) => (
    item.source === "catalog"
    && item.id === view.resolvedFoodId
    && item.locale === selectedName.languageTag
  ));
  if (exact.length !== 1) {
    throw new Error("Canonical barcode Food presentation did not resolve exactly.");
  }

  return {
    kind: "catalog",
    barcode,
    food: exact[0]!,
  };
}
