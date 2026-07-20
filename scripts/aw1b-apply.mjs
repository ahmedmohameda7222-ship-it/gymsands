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

function escapedInsideGeneratedString(value) {
  return JSON.stringify(value).slice(1, -1);
}

const oldDateFormatter = `    date: (value, options = {}) =>
      new Intl.DateTimeFormat(intlLocale, {
        dateStyle: "medium",
        ...options,
        timeZone: options.timeZone ?? "UTC"
      }).format(safeDate(value)),
    time: (value, options = {}) =>
      new Intl.DateTimeFormat(intlLocale, {
        hour: "2-digit",
        minute: "2-digit",
        ...options,
        timeZone: options.timeZone ?? "UTC"
      }).format(safeDate(value)),`;
const newDateFormatter = `    date: (value, options = {}) => {
      const hasExplicitDateFields = Boolean(
        options.dateStyle ||
        options.year ||
        options.month ||
        options.day ||
        options.weekday
      );
      return new Intl.DateTimeFormat(intlLocale, {
        ...(hasExplicitDateFields ? {} : { dateStyle: "medium" as const }),
        ...options,
        timeZone: options.timeZone ?? "UTC"
      }).format(safeDate(value));
    },
    time: (value, options = {}) => {
      const hasExplicitTimeFields = Boolean(
        options.timeStyle ||
        options.hour ||
        options.minute ||
        options.second
      );
      return new Intl.DateTimeFormat(intlLocale, {
        ...(hasExplicitTimeFields ? {} : { hour: "2-digit" as const, minute: "2-digit" as const }),
        ...options,
        timeZone: options.timeZone ?? "UTC"
      }).format(safeDate(value));
    },`;
source = source.replace(
  escapedInsideGeneratedString(oldDateFormatter),
  escapedInsideGeneratedString(newDateFormatter)
);

const oldLocaleAssertions = `    expect(english.decimal(1234.5)).not.toBe(german.decimal(1234.5));
    expect(arabic.decimal(1234.5)).not.toBe(english.decimal(1234.5));
    expect(english.integer(1234)).not.toBe(german.integer(1234));
    expect(arabic.integer(1234)).not.toBe(english.integer(1234));`;
const newLocaleAssertions = `    expect(english.decimal(1234.5)).toBe(
      new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(1234.5)
    );
    expect(german.decimal(1234.5)).toBe(
      new Intl.NumberFormat("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(1234.5)
    );
    expect(arabic.decimal(1234.5)).toBe(
      new Intl.NumberFormat("ar", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(1234.5)
    );
    expect(english.integer(1234)).toBe(new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(1234));
    expect(german.integer(1234)).toBe(new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(1234));
    expect(arabic.integer(1234)).toBe(new Intl.NumberFormat("ar", { maximumFractionDigits: 0 }).format(1234));
    expect(english.decimal(1234.5)).not.toBe(german.decimal(1234.5));`;
source = source.replace(
  escapedInsideGeneratedString(oldLocaleAssertions),
  escapedInsideGeneratedString(newLocaleAssertions)
);

const expandedPath = path.resolve("scripts/.aw1b-apply-expanded.mjs");
await writeFile(expandedPath, source, "utf8");
await import(pathToFileURL(expandedPath).href);
