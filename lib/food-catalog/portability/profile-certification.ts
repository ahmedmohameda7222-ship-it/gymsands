import type { PortableExportProfile, PortableExportManifestV1 } from "./export-contract";
import {
  FOOD_CATALOG_PORTABLE_RELATIONS_V1,
  type PortableRelationRule,
} from "./relation-registry";

export const PLAN7_CANONICAL_REGISTRY_AUTHORITY = "CANONICAL_REGISTRY_V1" as const;
export const PLAN7_DIAGNOSTIC_REGISTRY_AUTHORITY = "DIAGNOSTIC_SUBSET" as const;
export type Plan7RegistryAuthority =
  | typeof PLAN7_CANONICAL_REGISTRY_AUTHORITY
  | typeof PLAN7_DIAGNOSTIC_REGISTRY_AUTHORITY;

export function canonicalRulesForProfile(profile: PortableExportProfile): readonly PortableRelationRule[] {
  if (profile !== "CORE_PORTABLE" && profile !== "FULL_DR") {
    throw new Error(`Unsupported Plan 7 profile ${String(profile)}.`);
  }
  return Object.freeze(
    FOOD_CATALOG_PORTABLE_RELATIONS_V1.filter(
      (entry) => entry.requiredProfile === "CORE_PORTABLE" || profile === "FULL_DR",
    ),
  );
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export type CanonicalProfileValidation = Readonly<{
  profile: PortableExportProfile;
  registryAuthority: typeof PLAN7_CANONICAL_REGISTRY_AUTHORITY;
  requiredSegmentCount: number;
  descriptorAuthorityVerified: true;
  complete: true;
}>;

export function validateCanonicalProfileManifest(
  manifest: Pick<PortableExportManifestV1, "profile" | "segments"> & { registryAuthority?: string },
): CanonicalProfileValidation {
  if (manifest.registryAuthority !== PLAN7_CANONICAL_REGISTRY_AUTHORITY) {
    throw new Error("Trusted Plan 7 certification requires canonical registry authority; diagnostic subsets are non-certifiable.");
  }

  const rules = canonicalRulesForProfile(manifest.profile);
  const byName = new Map(manifest.segments.map((segment) => [segment.name, segment]));
  if (byName.size !== manifest.segments.length) throw new Error("Duplicate Plan 7 manifest segment descriptor.");

  const requiredNames = new Set(rules.map((rule) => rule.segment));
  const missing = rules.filter((rule) => !byName.has(rule.segment)).map((rule) => rule.segment);
  if (missing.length) {
    throw new Error(`Canonical ${manifest.profile} artifact is incomplete; missing required segments: ${missing.join(", ")}.`);
  }

  const unexpected = manifest.segments.map((segment) => segment.name).filter((name) => !requiredNames.has(name));
  if (unexpected.length) {
    throw new Error(`Canonical ${manifest.profile} artifact contains non-registry segments: ${unexpected.join(", ")}.`);
  }

  for (const rule of rules) {
    const descriptor = byName.get(rule.segment)!;
    const descriptorMismatch =
      descriptor.name !== rule.segment
      || descriptor.relation !== rule.relation
      || descriptor.classification !== rule.classification
      || descriptor.loadMode !== rule.loadMode
      || descriptor.protected !== rule.protected
      || descriptor.required !== true
      || !sameStrings(descriptor.stableKey, rule.stableKey);
    if (descriptorMismatch) {
      throw new Error(`Manifest descriptor for ${rule.segment} does not match canonical registry identity/classification/load-mode/protection/stable-key authority.`);
    }
  }

  return Object.freeze({
    profile: manifest.profile,
    registryAuthority: PLAN7_CANONICAL_REGISTRY_AUTHORITY,
    requiredSegmentCount: rules.length,
    descriptorAuthorityVerified: true,
    complete: true,
  });
}
