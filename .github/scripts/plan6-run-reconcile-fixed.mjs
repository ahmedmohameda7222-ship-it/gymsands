import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const sourcePath = ".github/scripts/plan6-production-reconcile-once.mjs";
const lines = readFileSync(sourcePath, "utf8").split("\n");
const index = lines.findIndex((line) => line.includes("const pendingBlock ="));
if (index < 0) throw new Error("pendingBlock line not found");
lines[index] = '  const pendingBlock = /const pendingEntries = ledger\\.entries\\.filter\\(\\((item|entry)\\) => \\1\\.state === "pending"\\);\\n    expect\\(pendingEntries\\)\\.toEqual\\(\\[\\n      expect\\.objectContaining\\(\\{\\n        localFile: PLAN6_EXACTNESS_CORRECTION,\\n        state: "pending",\\n      \\}\\),\\n    \\]\\);/;';
const fixedPath = "/tmp/plan6-production-reconcile-once.mjs";
writeFileSync(fixedPath, lines.join("\n"));
await import(pathToFileURL(fixedPath).href);
