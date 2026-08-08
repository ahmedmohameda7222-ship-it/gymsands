import { copyFile, mkdtemp, mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const P8A_ROUTE_TRACE_SUFFIX =
  "server/app/api/workouts/history/performed/[id]/report/route.js.nft.json";

export const P8A_REQUIRED_FONT_PATHS = Object.freeze([
  "lib/reports/pdf/assets/NotoSans-Regular.ttf",
  "lib/reports/pdf/assets/NotoSans-Bold.ttf",
  "lib/reports/pdf/assets/NotoSansArabic-Regular.ttf",
  "lib/reports/pdf/assets/NotoSansArabic-Bold.ttf",
]);

export class P8aRuntimeAssetVerificationError extends Error {
  constructor(code) {
    super("P8A runtime asset verification failed.");
    this.name = "P8aRuntimeAssetVerificationError";
    this.code = code;
  }
}

export function normalizeTracePath(value) {
  return String(value).replaceAll("\\", "/").replace(/^\.\//u, "");
}

function fail(code) {
  throw new P8aRuntimeAssetVerificationError(code);
}

async function isFile(filename) {
  try {
    return (await stat(filename)).isFile();
  } catch {
    return false;
  }
}

async function findFiles(root, suffix, depth = 0) {
  if (depth > 16) return [];
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const matches = [];
  for (const entry of entries) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) {
      matches.push(...(await findFiles(target, suffix, depth + 1)));
    } else if (normalizeTracePath(target).endsWith(suffix)) {
      matches.push(target);
    }
  }
  return matches;
}

export async function locateP8aRouteTrace(buildRoot) {
  const normalizedSuffix = normalizeTracePath(P8A_ROUTE_TRACE_SUFFIX);
  const exactTracePath = path.join(buildRoot, ...normalizedSuffix.split("/"));
  if (await isFile(exactTracePath)) return exactTracePath;

  const matches = await findFiles(buildRoot, normalizedSuffix);
  if (matches.length !== 1) fail("P8A_RUNTIME_TRACE_MISSING");
  return matches[0];
}

function parseTrace(raw) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    fail("P8A_RUNTIME_TRACE_INVALID");
  }
  if (!value || !Array.isArray(value.files)) {
    fail("P8A_RUNTIME_TRACE_INVALID");
  }
  return value;
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function traceEntries(tracePath, files, projectRoot, buildRoot) {
  const traceDirectory = path.dirname(tracePath);
  return files.map((entry) => {
    const normalizedEntry = normalizeTracePath(entry);
    const absolute = path.resolve(
      traceDirectory,
      normalizedEntry.split("/").join(path.sep),
    );
    return {
      entry: normalizedEntry,
      absolute,
      projectRelative: normalizeTracePath(path.relative(projectRoot, absolute)),
      buildRelative: normalizeTracePath(path.relative(buildRoot, absolute)),
      insideBuild: isInside(buildRoot, absolute),
    };
  });
}

function fontStem(fontPath) {
  return path.basename(fontPath, path.extname(fontPath));
}

function deployedFontPattern(fontPath) {
  const escaped = fontStem(fontPath).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(?:^|/)assets/${escaped}\\.[A-Za-z0-9_-]+\\.ttf$`, "u");
}

function findDeployedFontEntry(entries, requiredPath) {
  const pattern = deployedFontPattern(requiredPath);
  return entries.find(
    (entry) =>
      entry.insideBuild &&
      pattern.test(entry.buildRelative) &&
      !entry.projectRelative.endsWith(normalizeTracePath(requiredPath)),
  );
}

function findRequiredEntry(entries, requiredPath) {
  const normalizedRequired = normalizeTracePath(requiredPath);
  return entries.find(
    (entry) =>
      entry.projectRelative === normalizedRequired ||
      entry.projectRelative.endsWith(`/${normalizedRequired}`) ||
      entry.entry.endsWith(`/${normalizedRequired}`) ||
      entry.entry === normalizedRequired,
  );
}

async function digest(filename) {
  const bytes = await readFile(filename);
  return createHash("sha256").update(bytes).digest("hex");
}

async function proveIsolatedAssets(requiredEntries) {
  const isolatedRoot = await mkdtemp(path.join(os.tmpdir(), "p8a-runtime-assets-"));
  try {
    for (const item of requiredEntries) {
      const relative = normalizeTracePath(item.entry.buildRelative);
      if (
        relative.startsWith("../") ||
        path.isAbsolute(relative) ||
        !item.entry.insideBuild
      ) {
        fail("P8A_RUNTIME_SOURCE_DEPENDENCY");
      }
      const destination = path.join(isolatedRoot, ...relative.split("/"));
      await mkdir(path.dirname(destination), { recursive: true });
      await copyFile(item.entry.absolute, destination);
      if (!(await isFile(destination))) fail("P8A_RUNTIME_ISOLATION_FAILED");
    }
    return true;
  } finally {
    await rm(isolatedRoot, { recursive: true, force: true });
  }
}

export async function verifyP8aRuntimeAssets({
  projectRoot = process.cwd(),
  buildRoot = path.join(projectRoot, ".next"),
  tracePath,
  requiredFonts = P8A_REQUIRED_FONT_PATHS,
  brandingAsset = null,
} = {}) {
  const exactTracePath = tracePath ?? (await locateP8aRouteTrace(buildRoot));
  if (!(await isFile(exactTracePath))) fail("P8A_RUNTIME_TRACE_MISSING");

  const trace = parseTrace(await readFile(exactTracePath, "utf8"));
  const entries = traceEntries(exactTracePath, trace.files, projectRoot, buildRoot);
  const requiredEntries = [];

  for (const fontPath of requiredFonts) {
    const sourceFont = path.join(projectRoot, ...normalizeTracePath(fontPath).split("/"));
    const entry = findDeployedFontEntry(entries, fontPath);
    if (!entry || !(await isFile(entry.absolute)) || !(await isFile(sourceFont))) {
      fail("P8A_RUNTIME_FONT_MISSING");
    }
    if ((await digest(entry.absolute)) !== (await digest(sourceFont))) {
      fail("P8A_RUNTIME_FONT_MISMATCH");
    }
    if (findRequiredEntry(entries, fontPath)) {
      fail("P8A_RUNTIME_SOURCE_DEPENDENCY");
    }
    requiredEntries.push({ requiredPath: fontPath, entry });
  }

  if (brandingAsset) {
    const entry = findRequiredEntry(entries, brandingAsset);
    if (!entry || !(await isFile(entry.absolute)) || !entry.insideBuild) {
      fail("P8A_RUNTIME_BRANDING_MISSING");
    }
    requiredEntries.push({ requiredPath: brandingAsset, entry });
  }

  if (
    entries.some((entry) =>
      entry.projectRelative.endsWith("public/plaivra-logo.png"),
    )
  ) {
    fail("P8A_RUNTIME_PUBLIC_LOGO_INCLUDED");
  }

  const isolatedRuntimeProof = await proveIsolatedAssets(requiredEntries);
  return Object.freeze({
    ok: true,
    trace: P8A_ROUTE_TRACE_SUFFIX,
    fontCount: requiredFonts.length,
    branding: brandingAsset ? "traced-image" : "embedded-vector-wordmark",
    isolatedRuntimeProof,
    sourceCheckoutRequired: false,
  });
}

async function main() {
  try {
    const result = await verifyP8aRuntimeAssets();
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const code =
      error instanceof P8aRuntimeAssetVerificationError
        ? error.code
        : "P8A_RUNTIME_VERIFICATION_FAILED";
    process.stderr.write(`${JSON.stringify({ ok: false, code })}\n`);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  await main();
}
