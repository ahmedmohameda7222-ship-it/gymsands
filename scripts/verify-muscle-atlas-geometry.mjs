import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const width = 1024;
const height = 1536;
const pixelCount = width * height;
const repoRoot = process.cwd();
const sourceRoot = path.join(repoRoot, "assets/muscle-intelligence/advanced-visible-v1/source");
const semanticRoot = path.join(repoRoot, "assets/muscle-intelligence/advanced-visible-v1/semantic");
const manifest = JSON.parse(await readFile(path.join(repoRoot, "data/muscle-intelligence/advanced-visible-v1/final-region-manifest.json"), "utf8"));
const evidenceArgument = process.argv.indexOf("--evidence-dir");
const evidenceRoot = evidenceArgument >= 0 ? path.resolve(process.argv[evidenceArgument + 1]) : null;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function renderMask(pathData) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="geometricPrecision"><path fill="#fff" d="${pathData}"/></svg>`;
  const { data } = await sharp(Buffer.from(svg)).flatten({ background: "#000" }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const mask = new Uint8Array(pixelCount);
  for (let pixel = 0; pixel < pixelCount; pixel += 1) mask[pixel] = data[pixel] > 127 ? 1 : 0;
  return mask;
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
    rectangle(507, 166, 517, 710);
    ellipse(512, 610, 8, 7);
    ellipse(411, 1097, 22, 20);
    ellipse(613, 1097, 22, 20);
    rectangle(350, 1366, 431, 1410);
    rectangle(593, 1366, 674, 1410);
  } else {
    rectangle(507, 145, 517, 810);
    rectangle(380, 802, 509, 811);
    rectangle(515, 802, 644, 811);
    for (let y = 1000; y < 1052; y += 1) for (let x = 0; x < width; x += 1) {
      const local = x < width / 2 ? x : width - 1 - x;
      if (local >= 420 && local < 445) mask[y * width + x] = 1;
    }
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

if (manifest.schemaVersion !== "advanced_visible_v1_semantic_regions_v2") throw new Error("Unsupported semantic atlas manifest schema.");
for (const view of ["front", "back"]) {
  const record = manifest.views[view];
  const semanticBytes = await readFile(path.join(semanticRoot, `muscle-semantic-${view}.svg`));
  if (sha256(semanticBytes) !== record.semanticSourceSha256 || semanticBytes.length !== record.semanticSourceBytes) {
    throw new Error(`${view} semantic source hash or byte count changed.`);
  }
}
if (manifest.runtimePaths.length !== 116
  || manifest.validation.nonEmptyTargetViewCount !== 58
  || manifest.validation.crossTargetInteriorOverlapPixels !== 0
  || manifest.validation.bodySilhouetteLeakagePixels !== 0
  || manifest.validation.protectedNeutralCoveragePixels !== 0
  || manifest.validation.maximumSourceToRuntimeBoundaryDisplacementPixels > 2
  || manifest.validation.isolatedMaximumBoundaryDisplacementPixels > 4) {
  throw new Error("Recorded semantic atlas geometry gates failed.");
}

const rendered = { front: [], back: [] };
for (const entry of manifest.runtimePaths) rendered[entry.view].push({ ...entry, mask: await renderMask(entry.pathData) });
const overlapMatrix = [];
for (const view of ["front", "back"]) {
  const entries = rendered[view];
  for (let left = 0; left < entries.length; left += 1) {
    for (let right = left + 1; right < entries.length; right += 1) {
      let overlapPixels = 0;
      for (let pixel = 0; pixel < pixelCount; pixel += 1) overlapPixels += entries[left].mask[pixel] && entries[right].mask[pixel] ? 1 : 0;
      overlapMatrix.push({
        view,
        left: `${entries[left].canonicalId}:${entries[left].side}`,
        right: `${entries[right].canonicalId}:${entries[right].side}`,
        overlapPixels
      });
    }
  }
}
const matrixJson = `${JSON.stringify(overlapMatrix)}\n`;
if (overlapMatrix.length !== 3310 || overlapMatrix.some((entry) => entry.overlapPixels !== 0)
  || sha256(matrixJson) !== manifest.validation.overlapMatrixSha256) {
  throw new Error("Recomputed target overlap matrix does not match the manifest.");
}

if (evidenceRoot) {
  await mkdir(evidenceRoot, { recursive: true });
  await writeFile(path.join(evidenceRoot, "overlap-matrix.json"), `${JSON.stringify({
    schemaVersion: "advanced_visible_v1_overlap_matrix_v1",
    pairCount: overlapMatrix.length,
    sha256: sha256(matrixJson),
    entries: overlapMatrix
  }, null, 2)}\n`, "utf8");

  const palette = ["#ff3b30", "#ff9500", "#ffcc00", "#34c759", "#00c7be", "#007aff", "#5856d6", "#af52de", "#ff2d55"];
  for (const view of ["front", "back"]) {
    const anatomy = path.join(sourceRoot, `muscle-anatomy-${view}.png`);
    const targetIds = [...new Set(rendered[view].map((entry) => entry.canonicalId))].sort();
    const colorByTarget = new Map(targetIds.map((targetId, index) => [targetId, palette[index % palette.length]]));
    const allPaths = rendered[view].map((entry) => `<path d="${entry.pathData}" fill="${colorByTarget.get(entry.canonicalId)}" fill-opacity=".68"/>`).join("");
    const overlaySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${allPaths}</svg>`;
    await sharp(anatomy).composite([{ input: Buffer.from(overlaySvg) }]).png().toFile(path.join(evidenceRoot, `${view}-semantic-overlay.png`));

    const coverage = new Uint16Array(pixelCount);
    for (const entry of rendered[view]) for (let pixel = 0; pixel < pixelCount; pixel += 1) coverage[pixel] += entry.mask[pixel];
    const neutral = protectedNeutralMask(view);
    const proofPixels = Buffer.alloc(pixelCount * 4);
    for (let pixel = 0; pixel < pixelCount; pixel += 1) {
      const offset = pixel * 4;
      if (coverage[pixel] > 1) {
        proofPixels[offset] = 255;
        proofPixels[offset + 3] = 255;
      } else if (coverage[pixel]) {
        proofPixels[offset + 1] = 190;
        proofPixels[offset + 3] = 120;
      }
    }
    await sharp(anatomy).composite([{ input: proofPixels, raw: { width, height, channels: 4 } }]).png().toFile(path.join(evidenceRoot, `${view}-zero-overlap-map.png`));
    const neutralPixels = Buffer.alloc(pixelCount * 4);
    for (let pixel = 0; pixel < pixelCount; pixel += 1) {
      if (!neutral[pixel]) continue;
      const offset = pixel * 4;
      neutralPixels[offset] = coverage[pixel] ? 255 : 250;
      neutralPixels[offset + 1] = coverage[pixel] ? 0 : 190;
      neutralPixels[offset + 3] = 175;
    }
    await sharp(anatomy).composite([{ input: neutralPixels, raw: { width, height, channels: 4 } }]).png().toFile(path.join(evidenceRoot, `${view}-protected-neutral-map.png`));

    const boundarySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g fill="none" stroke="#00e5ff" stroke-width="1.25">${rendered[view].map((entry) => `<path d="${entry.pathData}"/>`).join("")}</g></svg>`;
    const boundaryBase = await sharp(anatomy).composite([{ input: Buffer.from(boundarySvg) }]).png().toBuffer();
    const crops = view === "front"
      ? [{ name: "upper", left: 250, top: 140, width: 524, height: 520 }, { name: "core", left: 330, top: 390, width: 364, height: 390 }, { name: "thighs", left: 330, top: 650, width: 364, height: 470 }, { name: "lower-legs", left: 330, top: 1070, width: 364, height: 350 }]
      : [{ name: "upper", left: 235, top: 130, width: 554, height: 500 }, { name: "glutes", left: 350, top: 570, width: 324, height: 250 }, { name: "hamstrings", left: 350, top: 780, width: 324, height: 280 }, { name: "calves", left: 350, top: 1010, width: 324, height: 370 }];
    for (const crop of crops) {
      await sharp(boundaryBase).extract(crop).resize(crop.width * 4, crop.height * 4, { kernel: "nearest" }).png()
        .toFile(path.join(evidenceRoot, `${view}-boundary-${crop.name}-400pct.png`));
    }

    const tileWidth = 256;
    const tileHeight = 414;
    const columns = 6;
    const rows = Math.ceil(targetIds.length / columns);
    const sheet = sharp({ create: { width: columns * tileWidth, height: rows * tileHeight, channels: 3, background: "#f8fafc" } });
    const composites = [];
    for (let index = 0; index < targetIds.length; index += 1) {
      const targetId = targetIds[index];
      const paths = rendered[view].filter((entry) => entry.canonicalId === targetId).map((entry) => `<path d="${entry.pathData}"/>`).join("");
      const tileOverlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${tileWidth}" height="384" viewBox="0 0 ${width} ${height}"><g fill="#ef4444" fill-opacity=".72" stroke="#7f1d1d" stroke-width="2">${paths}</g></svg>`;
      const body = await sharp(anatomy).resize(tileWidth, 384).composite([{ input: Buffer.from(tileOverlay) }]).png().toBuffer();
      const label = `<svg xmlns="http://www.w3.org/2000/svg" width="${tileWidth}" height="30"><rect width="100%" height="100%" fill="#0f172a"/><text x="8" y="20" fill="white" font-family="Arial" font-size="13">${targetId}</text></svg>`;
      const tile = await sharp({ create: { width: tileWidth, height: tileHeight, channels: 3, background: "white" } })
        .composite([{ input: body, top: 0, left: 0 }, { input: Buffer.from(label), top: 384, left: 0 }]).png().toBuffer();
      composites.push({ input: tile, left: (index % columns) * tileWidth, top: Math.floor(index / columns) * tileHeight });
    }
    await sheet.composite(composites).png().toFile(path.join(evidenceRoot, `${view}-target-contact-sheet.png`));
  }
}

console.log(JSON.stringify({
  runtimePathCount: manifest.runtimePaths.length,
  targetViewCount: manifest.validation.nonEmptyTargetViewCount,
  overlapMatrixPairCount: overlapMatrix.length,
  crossTargetInteriorOverlapPixels: 0,
  bodySilhouetteLeakagePixels: manifest.validation.bodySilhouetteLeakagePixels,
  protectedNeutralCoveragePixels: manifest.validation.protectedNeutralCoveragePixels,
  maximumBoundaryDisplacementPixels: manifest.validation.maximumSourceToRuntimeBoundaryDisplacementPixels,
  evidenceDirectory: evidenceRoot
}, null, 2));
