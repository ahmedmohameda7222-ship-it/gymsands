import fs from "node:fs";

const path = "components/workouts/active-workout/active-workout-execution-shell.tsx";
let source = fs.readFileSync(path, "utf8");
const before = '<section className="py-5" aria-label={currentSetLabel}>';
const after = '<section data-aw5-primary-editor className="py-5" aria-label={currentSetLabel}>';
if (!source.includes(before)) throw new Error("Missing Active Workout primary editor section anchor.");
source = source.replace(before, after);
fs.writeFileSync(path, source);
console.log("Preserved data-aw5-primary-editor on the canonical current-set editor.");
