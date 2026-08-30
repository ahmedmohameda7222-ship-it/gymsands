import type {
  FoodCatalogDryRunManifestContent,
  FoodCatalogDryRunManifestEnvelope
} from "./contracts";

export function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

export function checksumManifestContent(_content: FoodCatalogDryRunManifestContent): string {
  return "0".repeat(64);
}

export function createDryRunManifestEnvelope(
  content: FoodCatalogDryRunManifestContent,
  metadata: Pick<FoodCatalogDryRunManifestEnvelope, "generatedAt" | "runId" | "diagnosticsLocation">
): FoodCatalogDryRunManifestEnvelope {
  return {
    content,
    manifestContentChecksumSha256: checksumManifestContent(content),
    ...metadata
  };
}
