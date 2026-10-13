/**
 * Offline-only Plan 9 1A1 review package. No Production DB client or DML.
 * node scripts/food-catalog-plan9-1a1-runner.mjs --zip /tmp/release.zip
 *   --index data/food-catalog/source-locks/plan9-1a1-match-index-2026-10-13.json
 *   --output /tmp/plan9-a
 */
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { stableJson } from "../lib/food-catalog/ingestion/manifest";
import { parseUsdaFoundationJson, type UsdaFoundationLock } from "../lib/food-catalog/ingestion/usda-foundation";
import { selectUsdaFoundationCanary } from "../lib/food-catalog/ingestion/usda-foundation/canary";
import type { FoodCatalogMatchIndex } from "../lib/food-catalog/ingestion/matching";

const sha256 = (v: Buffer | string) => createHash("sha256").update(v).digest("hex");
const args = Object.fromEntries(process.argv.slice(2).reduce<string[][]>((out, x, i, all) => {
  if (i % 2 === 0) {
    if (!x.startsWith("--") || !all[i + 1]) throw new Error("Expected --zip --index --output.");
    out.push([x.slice(2), all[i + 1]!]);
  }
  return out;
}, []));
for (const key of ["zip", "index", "output"]) if (!args[key]) throw new Error("Missing --" + key);
for (const key of Object.keys(args)) if (!["zip", "index", "output"].includes(key)) throw new Error("Unexpected option: " + key);
const outDir = path.resolve(args.output!);
const rel = path.relative(process.cwd(), outDir).split(path.sep);
if (outDir === process.cwd() || (!rel.includes("..") && ["lib", "app", "data", "supabase", "services", ".github", "scripts"].includes(rel[0]!))) {
  throw new Error("Refusing to write offline evidence into application source directories.");
}
const lock = JSON.parse(await readFile("data/food-catalog/source-locks/usda-foundation-2026-04.json", "utf8")) as UsdaFoundationLock;
const bytes = await readFile(args.zip!);
if (bytes.length !== lock.sourceBytes || sha256(bytes) !== lock.sourceChecksumSha256) throw new Error("Official USDA Foundation ZIP checksum/size mismatch.");
const zip = await JSZip.loadAsync(bytes);
const files = Object.values(zip.files).filter(f => !f.dir);
if (files.length !== 1 || files[0]!.name !== lock.sourceJsonFilename) throw new Error("Unexpected USDA ZIP member layout.");
const parsed = parseUsdaFoundationJson(await files[0]!.async("string"));
const snapshot = JSON.parse(await readFile(args.index!, "utf8")) as {
  snapshotId: string; captureMethod: string; readOnly: boolean;
  productionMutationsAuthorized: boolean; matchIndex: FoodCatalogMatchIndex;
  captureEvidence: { projectId: string; observationDate: string };
};
if (!snapshot.snapshotId || !snapshot.captureMethod || snapshot.readOnly !== true
  || snapshot.productionMutationsAuthorized !== false
  || snapshot.captureEvidence?.projectId !== "bkwezjxvapaeasfvlhvv") {
  throw new Error("Canary needs an explicit read-only Plaivra Main canonical index snapshot.");
}
for (const key of ["sourceIdentities", "gtinOwners", "redirects", "semanticIdentities", "qualifiedAliases", "possibleDuplicateNames"] as const) {
  if (!Array.isArray(snapshot.matchIndex?.[key])) throw new Error("Missing match-index collection " + key);
}
const result = selectUsdaFoundationCanary(lock, {
  sourceZipSha256: sha256(bytes), sourceZipBytes: bytes.length, foods: parsed.foods
}, snapshot.matchIndex);
const counts = result.canary.manifestContent.expectedMutations;
if (parsed.foods.length !== 363 || parsed.nullSlotCount !== 32 || counts.input !== 80 || counts.accepted !== 80)
  throw new Error("Unexpected Foundation population or canary mutation counts.");
const shaSnapshot = sha256(stableJson(snapshot));
const checksums = {
  sourceZipSha256: lock.sourceChecksumSha256,
  configChecksumSha256: lock.configChecksumSha256,
  selectionChecksumSha256: result.selectionChecksumSha256,
  matchIndexChecksumSha256: result.matchIndexChecksumSha256,
  snapshotChecksumSha256: shaSnapshot,
  manifestContentChecksumSha256: result.canary.manifestContentChecksumSha256,
  semanticBatchIdentityChecksumSha256: result.canary.semanticBatchIdentityChecksumSha256
};
const qa = {
  schemaVersion: "plaivra-food-catalog-plan9-foundation-1a1-qa-v1",
  status: "OFFLINE_EVIDENCE_ONLY", productionAuthority: false,
  projectId: snapshot.captureEvidence.projectId, snapshotId: snapshot.snapshotId,
  captureDate: snapshot.captureEvidence.observationDate,
  input: { sourceFoodCount: parsed.foods.length, nullSlots: parsed.nullSlotCount },
  cohorts: result.selection.cohortCounts ?? { strong: 60, missingEnergy: 10, evidenceEdge: 10 },
  selection: result.selection,
  mutations: counts, checksums,
  note: "A CI/offline result cannot substitute for a separately authorized reconciled Production database dry run."
};
await mkdir(outDir, { recursive: true });
for (const [name, obj] of [
  ["canary-selection.json", result.selection],
  ["manifest-content.json", result.canary.manifestContent],
  ["qa.json", qa],
  ["checksums.json", checksums]
] as const) await writeFile(path.join(outDir, name), stableJson(obj) + "\n", { flag: "wx" });
console.log(stableJson({ status: qa.status, selected: counts.input, ...checksums }));
