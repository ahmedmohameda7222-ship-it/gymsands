import { spawnSync } from "node:child_process";

for (const script of [
  "scripts/run-workout-history-core-qa.mjs",
  "scripts/run-workout-report-qa.mjs",
]) {
  const result = spawnSync(process.execPath, [script], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
