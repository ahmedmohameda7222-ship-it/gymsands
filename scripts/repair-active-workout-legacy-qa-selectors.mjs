import fs from "node:fs";

const path = "components/workouts/active-workout/active-workout-execution-shell.tsx";
let source = fs.readFileSync(path, "utf8");
const replacements = [
  ['<ol data-aw10-set-path', '<ol data-aw5-set-path data-aw10-set-path'],
  ['<MobileStickyActions placement="session" data-aw10-sticky-actions>', '<MobileStickyActions placement="session" data-aw5-sticky-actions data-aw10-sticky-actions>'],
];
for (const [before, after] of replacements) {
  if (!source.includes(before)) throw new Error(`Missing selector compatibility anchor: ${before}`);
  source = source.replace(before, after);
}
fs.writeFileSync(path, source);
console.log("Active Workout legacy rendered-QA selectors preserved on canonical elements.");
