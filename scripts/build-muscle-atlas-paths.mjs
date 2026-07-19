import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const width = 1024;
const height = 1536;
const pixelCount = width * height;
const sourceRoot = path.resolve("assets/muscle-intelligence/advanced-visible-v1/source");
const semanticRoot = path.resolve("assets/muscle-intelligence/advanced-visible-v1/semantic");
const outputRoot = path.resolve("data/muscle-intelligence/advanced-visible-v1");
const manifestPath = path.join(outputRoot, "final-region-manifest.json");
const registryPath = path.join(outputRoot, "target-view-registry.json");
const sideOrder = new Map([["left", 0], ["right", 1]]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function attribute(tag, name) {
  return tag.match(new RegExp(`\\b${name}="([^"]+)"`))?.[1];
}

function sanitizeCanonicalId(id) {
  return id.replaceAll(".", "-").replaceAll("_", "-");
}

function parseSemanticSource(svg, expectedView) {
  if (!/<svg\b[^>]*\bviewBox="0 0 1024 1536"/.test(svg)) throw new Error(`${expectedView} semantic source must use viewBox 0 0 1024 1536.`);
  if (/<(?:image|text|foreignObject|rect)\b/i.test(svg)) throw new Error(`${expectedView} semantic source contains a prohibited visual element.`);
  if (/\btransform=|#[0-9a-f]{3,8}\b|\brgb\(|\bhsl\(/i.test(svg)) throw new Error(`${expectedView} semantic source contains a transform or palette value.`);
  const groups = [];
  const ids = new Set();
  for (const match of svg.matchAll(/<g\b([^>]*)>([\s\S]*?)<\/g>/g)) {
    const groupTag = match[1];
    const body = match[2];
    const id = attribute(groupTag, "id");
    const canonicalId = attribute(groupTag, "data-canonical-id");
    const view = attribute(groupTag, "data-view");
    const side = attribute(groupTag, "data-side");
    if (!id || !canonicalId || view !== expectedView || !["left", "right"].includes(side)) {
      throw new Error(`${expectedView} semantic group metadata is incomplete.`);
    }
    const expectedId = `muscle-${view}-${sanitizeCanonicalId(canonicalId)}-${side}`;
    if (id !== expectedId) throw new Error(`${id} does not match stable semantic ID ${expectedId}.`);
    if (ids.has(id)) throw new Error(`Duplicate semantic ID ${id}.`);
    ids.add(id);
    const paths = [...body.matchAll(/<path\b([^>]*)\/>/g)].map((pathMatch) => {
      const pathTag = pathMatch[1];
      const pathId = attribute(pathTag, "id");
      const pathData = attribute(pathTag, "d");
      if (!pathId || !pathData || !/^M/.test(pathData) || !/Z$/i.test(pathData)) throw new Error(`${id} contains an invalid or open path.`);
      if (ids.has(pathId)) throw new Error(`Duplicate semantic ID ${pathId}.`);
      ids.add(pathId);
      return { id: pathId, pathData };
    });
    if (!paths.length) throw new Error(`${id} contains no closed semantic path.`);
    groups.push({ id, canonicalId, view, side, paths });
  }
  if (!groups.length) throw new Error(`${expectedView} semantic source contains no groups.`);
  return groups;
}

async function renderPathData(pathData) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="geometricPrecision"><path fill="#fff" fill-rule="nonzero" d="${pathData}"/></svg>`;
  const { data } = await sharp(Buffer.from(svg))
    .flatten({ background: "#000" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const mask = new Uint8Array(pixelCount);
  for (let pixel = 0; pixel < pixelCount; pixel += 1) mask[pixel] = data[pixel] > 127 ? 1 : 0;
  return mask;
}

async function bodySilhouetteMask(filename) {
  const { data } = await sharp(filename).greyscale().raw().toBuffer({ resolveWithObject: true });
  const body = new Uint8Array(pixelCount);
  for (let y = 0; y < height; y += 1) {
    const darkPixels = [];
    for (let x = 0; x < width; x += 1) if (data[y * width + x] < 254) darkPixels.push(x);
    let start = 0;
    while (start < darkPixels.length) {
      let end = start;
      while (end + 1 < darkPixels.length && darkPixels[end + 1] - darkPixels[end] <= 30) end += 1;
      if (darkPixels[end] - darkPixels[start] >= 3) {
        const left = Math.max(0, darkPixels[start] - 13);
        const right = Math.min(width - 1, darkPixels[end] + 13);
        for (let x = left; x <= right; x += 1) body[y * width + x] = 1;
      }
      start = end + 1;
    }
  }
  let expanded = body;
  for (let iteration = 0; iteration < 2; iteration += 1) {
    const next = expanded.slice();
    for (let pixel = width + 1; pixel < pixelCount - width - 1; pixel += 1) {
      if (expanded[pixel - 1] || expanded[pixel + 1] || expanded[pixel - width] || expanded[pixel + width]) next[pixel] = 1;
    }
    expanded = next;
  }
  return expanded;
}

function protectedNeutralMask(view) {
  const mask = new Uint8Array(pixelCount);
  function rectangle(left, top, right, bottom) {
    for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) mask[y * width + x] = 1;
  }
  function ellipse(cx, cy, rx, ry) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
        if (Math.pow((x - cx) / rx, 2) + Math.pow((y - cy) / ry, 2) <= 1) mask[y * width + x] = 1;
      }
    }
  }
  if (view === "front") {
    rectangle(507, 166, 517, 710); // throat, sternum, linea alba
    ellipse(512, 610, 8, 7); // umbilicus
    ellipse(411, 1097, 22, 20);
    ellipse(613, 1097, 22, 20); // patellae and knee tendons
    rectangle(350, 1366, 431, 1410);
    rectangle(593, 1366, 674, 1410); // ankle retinacula
  } else {
    rectangle(507, 145, 517, 810); // nuchal/trapezial aponeurosis, spine, fascia, cleft
    rectangle(380, 802, 509, 811);
    rectangle(515, 802, 644, 811); // gluteal folds
    for (let y = 1000; y < 1052; y += 1) for (let x = 0; x < width; x += 1) {
      const local = x < width / 2 ? x : width - 1 - x;
      if (local >= 420 && local < 445) mask[y * width + x] = 1;
    } // popliteal fossae and central posterior-knee structures
    for (let y = 1210; y < 1365; y += 1) {
      const radius = 8 + (y - 1210) * 0.05;
      for (let x = 0; x < width; x += 1) {
        const local = x < width / 2 ? x : width - 1 - x;
        if (Math.abs(local - 432) < radius) mask[y * width + x] = 1;
      }
    }
  }
  return mask;
}

const approvedAssets = JSON.parse(await readFile(path.join(sourceRoot, "asset-manifest.json"), "utf8"));
for (const asset of approvedAssets.files) {
  const bytes = await readFile(path.join(sourceRoot, asset.name));
  if (sha256(bytes) !== asset.sha256 || bytes.length !== asset.bytes) throw new Error(`Approved source asset ${asset.name} changed.`);
}

const priorManifest = JSON.parse(await readFile(manifestPath, "utf8"));
const priorRegistry = JSON.parse(await readFile(registryPath, "utf8"));
const hitAreas = priorManifest.hitAreas;
if (!Array.isArray(hitAreas) || hitAreas.length !== 6) throw new Error("Expected six retained precision hit areas.");
if (priorRegistry.targetViews.length !== 58) throw new Error("Expected the established 58 target-view definitions.");

const expectedByView = Object.fromEntries(["front", "back"].map((view) => [
  view,
  new Set(priorRegistry.targetViews.filter((entry) => entry.view === view).map((entry) => entry.canonicalId))
]));
if (expectedByView.front.size !== 28 || expectedByView.back.size !== 30) throw new Error("Established target-view cardinality changed.");

const runtimePaths = [];
const viewRecords = {};
const validationViews = {};
const overlapMatrix = [];
const geometryDiagnostics = [];
let crossTargetInteriorOverlapPixels = 0;
let bodySilhouetteLeakagePixels = 0;
let protectedNeutralCoveragePixels = 0;

for (const view of ["front", "back"]) {
  const semanticFilename = `muscle-semantic-${view}.svg`;
  const semanticBytes = await readFile(path.join(semanticRoot, semanticFilename));
  const semanticSvg = semanticBytes.toString("utf8");
  const groups = parseSemanticSource(semanticSvg, view);
  const actualTargetIds = new Set(groups.map((group) => group.canonicalId));
  if (groups.length !== expectedByView[view].size * 2
    || actualTargetIds.size !== expectedByView[view].size
    || [...expectedByView[view]].some((targetId) => !actualTargetIds.has(targetId))) {
    throw new Error(`${view} semantic source does not match the established target contract.`);
  }
  for (const targetId of expectedByView[view]) {
    const sides = groups.filter((group) => group.canonicalId === targetId).map((group) => group.side).sort();
    if (sides.join(",") !== "left,right") throw new Error(`${view}:${targetId} must contain separate left and right geometry.`);
  }

  const renderedGroups = [];
  const coverage = new Uint16Array(pixelCount);
  for (const group of groups.sort((left, right) => `${left.canonicalId}:${left.side}`.localeCompare(`${right.canonicalId}:${right.side}`))) {
    const pathData = group.paths.map((entry) => entry.pathData).join("");
    const mask = await renderPathData(pathData);
    const pixelArea = mask.reduce((sum, value) => sum + value, 0);
    if (!pixelArea) throw new Error(`${view}:${group.canonicalId}:${group.side} is empty.`);
    for (let pixel = 0; pixel < pixelCount; pixel += 1) coverage[pixel] += mask[pixel];
    renderedGroups.push({ ...group, mask, pixelArea, pathData });
    runtimePaths.push({
      canonicalId: group.canonicalId,
      view,
      side: group.side,
      pixelArea,
      contourCount: group.paths.length,
      pathSha256: sha256(pathData),
      pathData
    });
  }

  for (let left = 0; left < renderedGroups.length; left += 1) {
    for (let right = left + 1; right < renderedGroups.length; right += 1) {
      let overlapPixels = 0;
      for (let pixel = 0; pixel < pixelCount; pixel += 1) overlapPixels += renderedGroups[left].mask[pixel] && renderedGroups[right].mask[pixel] ? 1 : 0;
      overlapMatrix.push({
        view,
        left: `${renderedGroups[left].canonicalId}:${renderedGroups[left].side}`,
        right: `${renderedGroups[right].canonicalId}:${renderedGroups[right].side}`,
        overlapPixels
      });
    }
  }

  const anatomyFilename = `muscle-anatomy-${view}.png`;
  const body = await bodySilhouetteMask(path.join(sourceRoot, anatomyFilename));
  const neutral = protectedNeutralMask(view);
  for (const group of renderedGroups) {
    let bodyLeakagePixels = 0;
    let neutralCoveragePixels = 0;
    for (let pixel = 0; pixel < pixelCount; pixel += 1) {
      if (!group.mask[pixel]) continue;
      if (!body[pixel]) bodyLeakagePixels += 1;
      if (neutral[pixel]) neutralCoveragePixels += 1;
    }
    if (bodyLeakagePixels || neutralCoveragePixels) geometryDiagnostics.push({
      target: `${view}:${group.canonicalId}:${group.side}`,
      bodyLeakagePixels,
      neutralCoveragePixels
    });
  }
  let targetPixels = 0;
  let viewOverlap = 0;
  let viewBodyLeakage = 0;
  let viewNeutralCoverage = 0;
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    if (coverage[pixel]) targetPixels += 1;
    if (coverage[pixel] > 1) viewOverlap += 1;
    if (coverage[pixel] && !body[pixel]) viewBodyLeakage += 1;
    if (coverage[pixel] && neutral[pixel]) viewNeutralCoverage += 1;
  }
  crossTargetInteriorOverlapPixels += viewOverlap;
  bodySilhouetteLeakagePixels += viewBodyLeakage;
  protectedNeutralCoveragePixels += viewNeutralCoverage;
  validationViews[view] = {
    semanticGroupCount: groups.length,
    targetViewCount: expectedByView[view].size,
    targetPixels,
    crossTargetInteriorOverlapPixels: viewOverlap,
    bodySilhouetteLeakagePixels: viewBodyLeakage,
    protectedNeutralCoveragePixels: viewNeutralCoverage
  };
  const approvedAnatomy = approvedAssets.files.find((asset) => asset.name === anatomyFilename);
  viewRecords[view] = {
    semanticSourceFile: `semantic/${semanticFilename}`,
    semanticSourceSha256: sha256(semanticBytes),
    semanticSourceBytes: semanticBytes.length,
    semanticGroupCount: groups.length,
    semanticPathCount: groups.reduce((sum, group) => sum + group.paths.length, 0),
    grayscaleAuthorityFile: `source/${anatomyFilename}`,
    grayscaleAuthoritySha256: approvedAnatomy.sha256,
    grayscaleAuthorityBytes: approvedAnatomy.bytes
  };
}

if (runtimePaths.length !== 116
  || crossTargetInteriorOverlapPixels !== 0
  || bodySilhouetteLeakagePixels !== 0
  || protectedNeutralCoveragePixels !== 0) {
  throw new Error(JSON.stringify({
    runtimePathCount: runtimePaths.length,
    crossTargetInteriorOverlapPixels,
    bodySilhouetteLeakagePixels,
    protectedNeutralCoveragePixels,
    views: validationViews,
    overlaps: overlapMatrix.filter((entry) => entry.overlapPixels).sort((left, right) => right.overlapPixels - left.overlapPixels).slice(0, 20),
    geometryDiagnostics: geometryDiagnostics.sort((left, right) => (right.bodyLeakagePixels + right.neutralCoveragePixels) - (left.bodyLeakagePixels + left.neutralCoveragePixels)).slice(0, 30)
  }));
}

runtimePaths.sort((left, right) => `${left.view}:${left.canonicalId}:${left.side}`.localeCompare(`${right.view}:${right.canonicalId}:${right.side}`));
const targetViews = ["front", "back"].flatMap((view) => [...expectedByView[view]].sort().map((canonicalId) => ({
  canonicalId,
  view,
  sides: runtimePaths
    .filter((entry) => entry.view === view && entry.canonicalId === canonicalId)
    .map((entry) => entry.side)
    .sort((left, right) => sideOrder.get(left) - sideOrder.get(right)),
  hitAreaIds: hitAreas
    .filter((area) => area.view === view && area.canonicalId === canonicalId)
    .map((area) => area.id)
    .sort()
})));

const perTargetView = targetViews.map((targetView) => ({
  targetView: `${targetView.canonicalId}:${targetView.view}`,
  sideCount: targetView.sides.length,
  pixelArea: runtimePaths
    .filter((entry) => entry.view === targetView.view && entry.canonicalId === targetView.canonicalId)
    .reduce((sum, entry) => sum + entry.pixelArea, 0),
  sourceToRuntimeBoundaryDisplacementPixels: 0
}));
const overlapMatrixJson = `${JSON.stringify(overlapMatrix)}\n`;
const outputManifest = {
  schemaVersion: "advanced_visible_v1_semantic_regions_v2",
  logicalCanvas: { width, height, viewBox: `0 0 ${width} ${height}` },
  authority: {
    geometry: "approved grayscale anatomy underlay plus final surface-anatomy region contract",
    coloredReferences: "intent and manual QA only; not shipped or used at runtime",
    rejectedPainterMasks: "provenance-only assets; excluded from generation and runtime"
  },
  views: viewRecords,
  hitAreas,
  runtimePaths,
  validation: {
    rasterization: "semantic source and runtime path comparison at 1024x1536",
    threshold: 127,
    bodySilhouetteBoundaryTolerancePixels: 2,
    runtimePathCount: runtimePaths.length,
    nonEmptyTargetViewCount: perTargetView.filter((entry) => entry.pixelArea > 0).length,
    crossTargetInteriorOverlapPixels,
    bodySilhouetteLeakagePixels,
    protectedNeutralCoveragePixels,
    maximumSourceToRuntimeBoundaryDisplacementPixels: 0,
    isolatedMaximumBoundaryDisplacementPixels: 0,
    overlapMatrixPairCount: overlapMatrix.length,
    overlapMatrixSha256: sha256(overlapMatrixJson),
    perTargetView,
    views: validationViews
  }
};

await writeFile(manifestPath, `${JSON.stringify(outputManifest, null, 2)}\n`, "utf8");
await writeFile(registryPath, `${JSON.stringify({
  schemaVersion: "advanced_visible_v1_target_view_registry_v3",
  targetViews
}, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  runtimePathCount: runtimePaths.length,
  targetViewCount: targetViews.length,
  crossTargetInteriorOverlapPixels,
  bodySilhouetteLeakagePixels,
  protectedNeutralCoveragePixels,
  maximumSourceToRuntimeBoundaryDisplacementPixels: 0,
  overlapMatrixPairCount: overlapMatrix.length,
  views: validationViews
}, null, 2));
