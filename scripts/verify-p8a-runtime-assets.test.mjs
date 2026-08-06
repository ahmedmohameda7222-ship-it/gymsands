import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  P8A_REQUIRED_FONT_PATHS,
  P8aRuntimeAssetVerificationError,
  normalizeTracePath,
  verifyP8aRuntimeAssets,
} from "./verify-p8a-runtime-assets.mjs";

function deployedName(font) {
  const basename = path.basename(font, ".ttf");
  return `${basename}.fixture_hash.ttf`;
}

async function fixture({
  omitFont,
  mismatchFont,
  sourceTraceFont,
  brandingAsset,
  includeBranding = true,
} = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "p8a-trace-test-"));
  const buildRoot = path.join(root, ".next");
  const tracePath = path.join(
    buildRoot,
    "server/app/api/workouts/history/performed/[id]/report/route.js.nft.json",
  );
  await mkdir(path.dirname(tracePath), { recursive: true });
  const files = [];
  for (const font of P8A_REQUIRED_FONT_PATHS) {
    const source = path.join(root, ...font.split("/"));
    await mkdir(path.dirname(source), { recursive: true });
    await writeFile(source, `font:${font}`);
    if (font === omitFont) continue;

    if (font === sourceTraceFont) {
      files.push(path.relative(path.dirname(tracePath), source));
      continue;
    }

    const emitted = path.join(buildRoot, "server/assets", deployedName(font));
    await mkdir(path.dirname(emitted), { recursive: true });
    await writeFile(
      emitted,
      font === mismatchFont ? `mismatch:${font}` : `font:${font}`,
    );
    files.push(path.relative(path.dirname(tracePath), emitted));
  }
  if (brandingAsset && includeBranding) {
    const target = path.join(buildRoot, "server/assets/plaivra-report-logo.hash.png");
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, "branding");
    files.push(path.relative(path.dirname(tracePath), target));
  }
  await writeFile(tracePath, JSON.stringify({ version: 1, files }));
  return { root, buildRoot, tracePath };
}

async function expectCode(action, code) {
  await assert.rejects(action, (error) => {
    assert.ok(error instanceof P8aRuntimeAssetVerificationError);
    assert.equal(error.code, code);
    assert.equal(error.message, "P8A runtime asset verification failed.");
    return true;
  });
}

test("fails with a stable code when the exact route trace is missing", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "p8a-no-trace-"));
  try {
    await expectCode(
      () => verifyP8aRuntimeAssets({ projectRoot: root }),
      "P8A_RUNTIME_TRACE_MISSING",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fails when one deployed required font is missing from the trace", async () => {
  const data = await fixture({ omitFont: P8A_REQUIRED_FONT_PATHS[2] });
  try {
    await expectCode(
      () =>
        verifyP8aRuntimeAssets({
          projectRoot: data.root,
          buildRoot: data.buildRoot,
          tracePath: data.tracePath,
        }),
      "P8A_RUNTIME_FONT_MISSING",
    );
  } finally {
    await rm(data.root, { recursive: true, force: true });
  }
});

test("fails when a deployed font does not match the repository-owned source", async () => {
  const data = await fixture({ mismatchFont: P8A_REQUIRED_FONT_PATHS[1] });
  try {
    await expectCode(
      () =>
        verifyP8aRuntimeAssets({
          projectRoot: data.root,
          buildRoot: data.buildRoot,
          tracePath: data.tracePath,
        }),
      "P8A_RUNTIME_FONT_MISMATCH",
    );
  } finally {
    await rm(data.root, { recursive: true, force: true });
  }
});

test("rejects a trace that depends on source-checkout font paths", async () => {
  const data = await fixture({ sourceTraceFont: P8A_REQUIRED_FONT_PATHS[0] });
  try {
    await expectCode(
      () =>
        verifyP8aRuntimeAssets({
          projectRoot: data.root,
          buildRoot: data.buildRoot,
          tracePath: data.tracePath,
        }),
      "P8A_RUNTIME_FONT_MISSING",
    );
  } finally {
    await rm(data.root, { recursive: true, force: true });
  }
});

test("fails when a configured report branding asset is missing", async () => {
  const brandingAsset = "server/assets/plaivra-report-logo.hash.png";
  const data = await fixture({ brandingAsset, includeBranding: false });
  try {
    await expectCode(
      () =>
        verifyP8aRuntimeAssets({
          projectRoot: data.root,
          buildRoot: data.buildRoot,
          tracePath: data.tracePath,
          brandingAsset,
        }),
      "P8A_RUNTIME_BRANDING_MISSING",
    );
  } finally {
    await rm(data.root, { recursive: true, force: true });
  }
});

test("accepts deployed hashed fonts and proves isolated asset readability", async () => {
  const data = await fixture();
  try {
    const result = await verifyP8aRuntimeAssets({
      projectRoot: data.root,
      buildRoot: data.buildRoot,
      tracePath: data.tracePath,
    });
    assert.deepEqual(result, {
      ok: true,
      trace:
        "server/app/api/workouts/history/performed/[id]/report/route.js.nft.json",
      fontCount: 4,
      branding: "embedded-vector-wordmark",
      isolatedRuntimeProof: true,
      sourceCheckoutRequired: false,
    });
  } finally {
    await rm(data.root, { recursive: true, force: true });
  }
});

test("locates the deterministic Next 16 route trace by default", async () => {
  const data = await fixture();
  try {
    const result = await verifyP8aRuntimeAssets({
      projectRoot: data.root,
      buildRoot: data.buildRoot,
    });
    assert.equal(result.ok, true);
    assert.equal(result.fontCount, 4);
    assert.equal(result.isolatedRuntimeProof, true);
  } finally {
    await rm(data.root, { recursive: true, force: true });
  }
});

test("normalizes Windows and Linux trace separators", () => {
  assert.equal(
    normalizeTracePath(
      ".\\..\\..\\.next\\server\\assets\\NotoSans-Regular.hash.ttf",
    ),
    "../../.next/server/assets/NotoSans-Regular.hash.ttf",
  );
  assert.equal(
    normalizeTracePath("./server/assets/NotoSans-Regular.hash.ttf"),
    "server/assets/NotoSans-Regular.hash.ttf",
  );
});

test("does not leak raw build-output paths through verifier errors", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "p8a-private-root-"));
  const secretMarker = path.basename(root);
  try {
    let captured;
    try {
      await verifyP8aRuntimeAssets({ projectRoot: root });
    } catch (error) {
      captured = error;
    }
    assert.ok(captured instanceof Error);
    assert.equal(captured.message.includes(secretMarker), false);
    assert.equal(JSON.stringify(captured).includes(secretMarker), false);
    const source = await readFile(
      new URL("./verify-p8a-runtime-assets.mjs", import.meta.url),
      "utf8",
    );
    assert.equal(source.includes("console.error(error"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
