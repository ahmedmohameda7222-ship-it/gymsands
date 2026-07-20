import { readdir, readFile, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import { pathToFileURL } from "node:url";

const partsDir = path.resolve("scripts/aw1b-payload");
const parts = (await readdir(partsDir))
  .filter((name) => /^part-\d+\.txt$/.test(name))
  .sort();
if (parts.length !== 8) throw new Error(`Expected 8 AW-1B payload parts, found ${parts.length}`);
const encoded = (await Promise.all(parts.map((name) => readFile(path.join(partsDir, name), "utf8")))).join("");
let source = gunzipSync(Buffer.from(encoded, "base64")).toString("utf8");
source = source.replace(
  'workout = replaceExact(workout, \'{tr("superset.label")} {supersetLabel(activeExercise.exercise)}\', \'{tr("superset.label", { label: supersetLabel(activeExercise.exercise) ?? "" })}\', "superset full message");',
  'workout = replaceExact(workout, \'{tr("superset")} {supersetLabel(activeExercise.exercise)}\', \'{tr("superset.label", { label: supersetLabel(activeExercise.exercise) ?? "" })}\', "superset full message");'
);
source = source.replace(
  'formatters.integer(activeProgressionTarget.next_target_reps)',
  'formatters.integer(Number(activeProgressionTarget.next_target_reps))'
);
const expandedPath = path.resolve("scripts/.aw1b-apply-expanded.mjs");
await writeFile(expandedPath, source, "utf8");
await import(pathToFileURL(expandedPath).href);
