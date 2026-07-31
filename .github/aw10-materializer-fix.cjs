const { readFileSync, writeFileSync } = require("node:fs");
const path = ".github/aw10-closure-materialize.cjs";
const source = readFileSync(path, "utf8");
const before = "expect(workflow.match(/ci-reports\\\\/active-workout-aw10-evidence\\\\//g)).toHaveLength(2);";
const after = "expect(workflow.match(/ci-reports\\\\/active-workout-aw10-evidence\\\\//g)).toHaveLength(1);";
if (!source.includes(before) || source.indexOf(before) !== source.lastIndexOf(before)) {
  throw new Error("AW-10 artifact cardinality assertion target is not unique.");
}
writeFileSync(path, source.replace(before, after), "utf8");
