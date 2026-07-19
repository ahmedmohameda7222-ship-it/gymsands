import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const sourceRoot = path.resolve("assets/muscle-intelligence/advanced-visible-v1/source");
const outputRoot = path.resolve("data/muscle-intelligence/advanced-visible-v1");
const manifestPath = path.join(outputRoot, "final-region-manifest.json");
const width = 1024;
const height = 1536;
const pixelCount = width * height;
const sideOrder = new Map([["left", 0], ["right", 1], ["center", 2]]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function parsePathTags(svg) {
  return [...svg.matchAll(/<path\b[^>]*\/>/g)].map((match) => {
    const tag = match[0];
    const fill = tag.match(/\bfill="([^"]+)"/)?.[1];
    const transform = tag.match(/\btransform="([^"]+)"/)?.[1] ?? "";
    const d = tag.match(/\bd="([^"]+)"/)?.[1];
    if (!fill || !d) throw new Error("Approved SVG path is missing fill or path data.");
    return { tag, fill, fingerprint: sha256(`${fill}\n${transform}\n${d}`) };
  });
}

function labelColor(label) {
  return `rgb(${label >> 16},${(label >> 8) & 255},${label & 255})`;
}

function pixelLabel(data, channels, index) {
  const offset = index * channels;
  return (data[offset] << 16) | (data[offset + 1] << 8) | data[offset + 2];
}

function maskFingerprint(pixels, bbox) {
  const payload = `${bbox.join(",")}|${pixels.map((pixel) => `${pixel % width},${Math.floor(pixel / width)}`).join(";")}`;
  return sha256(payload);
}

function connectedComponents(data, channels) {
  const seen = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  const components = [];
  for (let start = 0; start < pixelCount; start += 1) {
    if (seen[start]) continue;
    const label = pixelLabel(data, channels, start);
    seen[start] = 1;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    const pixels = [];
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    let sumX = 0;
    let sumY = 0;
    while (head < tail) {
      const pixel = queue[head++];
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      pixels.push(pixel);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      sumX += x;
      sumY += y;
      for (const neighbor of [pixel - 1, pixel + 1, pixel - width, pixel + width]) {
        if (neighbor < 0 || neighbor >= pixelCount || seen[neighbor]) continue;
        if (Math.abs((neighbor % width) - x) > 1) continue;
        if (pixelLabel(data, channels, neighbor) !== label) continue;
        seen[neighbor] = 1;
        queue[tail++] = neighbor;
      }
    }
    components.push({
      label,
      pixels,
      bbox: [minX, minY, maxX + 1, maxY + 1],
      centroid: [Number((sumX / pixels.length).toFixed(3)), Number((sumY / pixels.length).toFixed(3))]
    });
  }
  return components;
}

function vertexKey(x, y) {
  return `${x},${y}`;
}

function direction(edge) {
  if (edge.x2 > edge.x1) return 0;
  if (edge.y2 > edge.y1) return 1;
  if (edge.x2 < edge.x1) return 2;
  return 3;
}

function traceMask(mask) {
  const edges = [];
  const outgoing = new Map();
  function addEdge(x1, y1, x2, y2) {
    const index = edges.length;
    edges.push({ x1, y1, x2, y2, used: false });
    const key = vertexKey(x1, y1);
    const indexes = outgoing.get(key) ?? [];
    indexes.push(index);
    outgoing.set(key, indexes);
  }
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    if (!mask[pixel]) continue;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    if (y === 0 || !mask[pixel - width]) addEdge(x, y, x + 1, y);
    if (x === width - 1 || !mask[pixel + 1]) addEdge(x + 1, y, x + 1, y + 1);
    if (y === height - 1 || !mask[pixel + width]) addEdge(x + 1, y + 1, x, y + 1);
    if (x === 0 || !mask[pixel - 1]) addEdge(x, y + 1, x, y);
  }

  const loops = [];
  for (let startIndex = 0; startIndex < edges.length; startIndex += 1) {
    if (edges[startIndex].used) continue;
    const start = edges[startIndex];
    const points = [[start.x1, start.y1]];
    let currentIndex = startIndex;
    let guard = 0;
    while (guard++ <= edges.length) {
      const current = edges[currentIndex];
      current.used = true;
      points.push([current.x2, current.y2]);
      if (current.x2 === start.x1 && current.y2 === start.y1) break;
      const candidates = (outgoing.get(vertexKey(current.x2, current.y2)) ?? [])
        .filter((index) => !edges[index].used);
      if (!candidates.length) throw new Error("Generated contour is open.");
      const currentDirection = direction(current);
      candidates.sort((left, right) => {
        const leftTurn = (direction(edges[left]) - currentDirection + 4) % 4;
        const rightTurn = (direction(edges[right]) - currentDirection + 4) % 4;
        const priority = (turn) => [1, 0, 3, 2].indexOf(turn);
        return priority(leftTurn) - priority(rightTurn);
      });
      currentIndex = candidates[0];
    }
    if (points.at(-1)?.[0] !== start.x1 || points.at(-1)?.[1] !== start.y1) {
      throw new Error("Generated contour did not close.");
    }
    const simplified = [];
    for (const point of points.slice(0, -1)) {
      while (simplified.length >= 2) {
        const before = simplified.at(-2);
        const previous = simplified.at(-1);
        if ((before[0] === previous[0] && previous[0] === point[0])
          || (before[1] === previous[1] && previous[1] === point[1])) {
          simplified.pop();
        } else break;
      }
      simplified.push(point);
    }
    loops.push(simplified);
  }
  return loops.map((points) => {
    let data = `M${points[0][0]} ${points[0][1]}`;
    for (let index = 1; index < points.length; index += 1) {
      const [x, y] = points[index];
      const [previousX, previousY] = points[index - 1];
      data += previousY === y ? `H${x}` : previousX === x ? `V${y}` : `L${x} ${y}`;
    }
    return `${data}Z`;
  });
}

function keyFor(view, canonicalId, side) {
  return `${view}:${canonicalId}:${side}`;
}

function parseKey(key) {
  const first = key.indexOf(":");
  const last = key.lastIndexOf(":");
  return { view: key.slice(0, first), canonicalId: key.slice(first + 1, last), side: key.slice(last + 1) };
}

async function renderMask(pathData) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges"><path fill="#fff" fill-rule="nonzero" d="${pathData}"/></svg>`;
  const rendered = await sharp(Buffer.from(svg))
    .flatten({ background: "#000" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return rendered.data;
}

await mkdir(outputRoot, { recursive: true });
const approvedAssets = JSON.parse(await readFile(path.join(sourceRoot, "asset-manifest.json"), "utf8"));
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (manifest.schemaVersion !== "advanced_visible_v1_final_regions_v1") {
  throw new Error("Unsupported final-region manifest schema.");
}

const targetMasks = new Map();
const sourceUnions = { front: new Uint8Array(pixelCount), back: new Uint8Array(pixelCount) };
const verifiedViews = {};
for (const view of ["front", "back"]) {
  const recordedView = manifest.views[view];
  const svg = await readFile(path.join(sourceRoot, recordedView.sourceFile), "utf8");
  const approved = approvedAssets.files.find((file) => file.name === recordedView.sourceFile);
  if (!approved || sha256(svg) !== approved.sha256 || Buffer.byteLength(svg) !== approved.bytes) {
    throw new Error(`${view} approved segmentation source hash or byte count changed.`);
  }
  const paths = parsePathTags(svg);
  if (paths.length !== recordedView.sourcePathCount) throw new Error(`${view} source path count changed.`);
  let painterOrder = 0;
  const labelSvg = svg
    .replace("<svg ", '<svg shape-rendering="crispEdges" ')
    .replace(/<path\b[^>]*\/>/g, (tag) => tag.replace(/\bfill="[^"]+"/, `fill="${labelColor(++painterOrder)}"`));
  const rendered = await sharp(Buffer.from(labelSvg))
    .resize(width, height, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const actualComponents = connectedComponents(rendered.data, rendered.info.channels);
  const recordedByFingerprint = new Map(recordedView.regions.map((region) => [region.sourceComponentFingerprint, region]));
  if (recordedByFingerprint.size !== recordedView.regions.length
    || actualComponents.length !== recordedView.regions.length) {
    throw new Error(`${view} final-region component cardinality changed.`);
  }
  for (const component of actualComponents) {
    const sourcePathIndex = component.label - 1;
    const sourcePath = paths[sourcePathIndex];
    const componentFingerprint = maskFingerprint(component.pixels, component.bbox);
    const region = recordedByFingerprint.get(componentFingerprint);
    if (!region
      || region.sourceLayerFingerprint !== sourcePath.fingerprint
      || region.sourceFill !== sourcePath.fill
      || region.painterOrder !== sourcePathIndex + 1
      || region.pixelArea !== component.pixels.length
      || region.bbox.join(",") !== component.bbox.join(",")) {
      throw new Error(`${view} final-region metadata no longer matches the approved painter result.`);
    }
    if (region.classification === "target") {
      const key = keyFor(view, region.canonicalId, region.side);
      const mask = targetMasks.get(key) ?? new Uint8Array(pixelCount);
      for (const pixel of component.pixels) {
        if (sourceUnions[view][pixel]) throw new Error(`${view} source target masks overlap.`);
        sourceUnions[view][pixel] = 1;
        mask[pixel] = 1;
      }
      targetMasks.set(key, mask);
    } else if (region.classification !== "excluded") {
      throw new Error(`${view} region has an unsupported classification.`);
    }
  }
  verifiedViews[view] = {
    ...recordedView,
    sourceSha256: sha256(svg),
    regions: recordedView.regions
  };
}

const runtimePaths = [];
for (const [key, mask] of [...targetMasks].sort(([left], [right]) => left.localeCompare(right))) {
  const { view, canonicalId, side } = parseKey(key);
  const contours = traceMask(mask);
  const pathData = contours.join("");
  runtimePaths.push({
    canonicalId,
    view,
    side,
    pixelArea: mask.reduce((total, value) => total + value, 0),
    contourCount: contours.length,
    pathSha256: sha256(pathData),
    pathData
  });
}

const generatedCoverage = { front: new Uint16Array(pixelCount), back: new Uint16Array(pixelCount) };
const targetViewStats = new Map();
for (const runtimePath of runtimePaths) {
  const key = keyFor(runtimePath.view, runtimePath.canonicalId, runtimePath.side);
  const expected = targetMasks.get(key);
  const actual = await renderMask(runtimePath.pathData);
  let intersection = 0;
  let union = 0;
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const generated = actual[pixel] > 127 ? 1 : 0;
    intersection += expected[pixel] && generated ? 1 : 0;
    union += expected[pixel] || generated ? 1 : 0;
    generatedCoverage[runtimePath.view][pixel] += generated;
  }
  const targetViewKey = `${runtimePath.canonicalId}:${runtimePath.view}`;
  const stats = targetViewStats.get(targetViewKey) ?? { intersection: 0, union: 0 };
  stats.intersection += intersection;
  stats.union += union;
  targetViewStats.set(targetViewKey, stats);
}

const viewMetrics = {};
let crossTargetInteriorOverlapPixels = 0;
let neutralLeakagePixels = 0;
let unclassifiedClassifiedSourcePixels = 0;
for (const view of ["front", "back"]) {
  let intersection = 0;
  let union = 0;
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const source = sourceUnions[view][pixel];
    const generated = generatedCoverage[view][pixel] > 0 ? 1 : 0;
    if (generatedCoverage[view][pixel] > 1) crossTargetInteriorOverlapPixels += 1;
    if (!source && generated) neutralLeakagePixels += 1;
    if (source && !generated) unclassifiedClassifiedSourcePixels += 1;
    intersection += source && generated ? 1 : 0;
    union += source || generated ? 1 : 0;
  }
  viewMetrics[view] = {
    sourceTargetPixels: sourceUnions[view].reduce((total, value) => total + value, 0),
    aggregateIoU: Number((intersection / union).toFixed(6))
  };
}

const perTargetView = [...targetViewStats]
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([targetView, stats]) => ({ targetView, iou: Number((stats.intersection / stats.union).toFixed(6)) }));
const minimumTargetViewIoU = Math.min(...perTargetView.map((entry) => entry.iou));
const classifiedSourcePixels = viewMetrics.front.sourceTargetPixels + viewMetrics.back.sourceTargetPixels;
const unclassifiedPercent = Number(((unclassifiedClassifiedSourcePixels / classifiedSourcePixels) * 100).toFixed(6));
if (crossTargetInteriorOverlapPixels !== 0
  || neutralLeakagePixels !== 0
  || minimumTargetViewIoU < 0.99
  || viewMetrics.front.aggregateIoU < 0.995
  || viewMetrics.back.aggregateIoU < 0.995
  || unclassifiedPercent > 0.5) {
  throw new Error("Semantic atlas geometry thresholds failed.");
}

const targetViews = ["front", "back"].flatMap((view) => {
  const targetIds = [...new Set(runtimePaths.filter((entry) => entry.view === view).map((entry) => entry.canonicalId))].sort();
  return targetIds.map((canonicalId) => ({
    canonicalId,
    view,
    sides: runtimePaths
      .filter((entry) => entry.view === view && entry.canonicalId === canonicalId)
      .map((entry) => entry.side)
      .sort((left, right) => sideOrder.get(left) - sideOrder.get(right)),
    hitAreaIds: manifest.hitAreas
      .filter((area) => area.view === view && area.canonicalId === canonicalId)
      .map((area) => area.id)
      .sort()
  }));
});

const outputManifest = {
  ...manifest,
  views: verifiedViews,
  runtimePaths,
  validation: {
    rasterization: "categorical crisp-edge comparison at 1024x1536",
    antialiasTolerancePixels: 0,
    crossTargetInteriorOverlapPixels,
    neutralLeakagePixels,
    classifiedSourcePixels,
    unclassifiedClassifiedSourcePixels,
    unclassifiedPercent,
    minimumTargetViewIoU,
    perTargetView,
    views: viewMetrics
  }
};
await writeFile(manifestPath, `${JSON.stringify(outputManifest, null, 2)}\n`, "utf8");
await writeFile(path.join(outputRoot, "target-view-registry.json"), `${JSON.stringify({
  schemaVersion: "advanced_visible_v1_target_view_registry_v2",
  targetViews
}, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  runtimePathCount: runtimePaths.length,
  targetViewCount: targetViews.length,
  crossTargetInteriorOverlapPixels,
  neutralLeakagePixels,
  unclassifiedPercent,
  minimumTargetViewIoU,
  views: viewMetrics
}, null, 2));
