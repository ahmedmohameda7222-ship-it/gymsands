const { readFileSync, writeFileSync } = require("node:fs");

function replaceOnce(path, before, after) {
  const source = readFileSync(path, "utf8");
  const first = source.indexOf(before);
  const last = source.lastIndexOf(before);
  if (first < 0 || first !== last) {
    throw new Error(`${path}: expected exactly one replacement target`);
  }
  writeFileSync(path, source.replace(before, after), "utf8");
}

const coordinatorPath = "lib/workouts/active-session-sync/coordinator.ts";
replaceOnce(
  coordinatorPath,
  `import {
  addActiveWorkoutOperation,
  listActiveWorkoutOperations,
  updateActiveWorkoutOperation,
} from "./indexed-db";`,
  `import {
  addActiveWorkoutOperation,
  listActiveWorkoutOperations,
  updateActiveWorkoutOperation,
} from "./indexed-db";
import { acquireActiveWorkoutFallbackLease } from "./fallback-lease";`,
);
replaceOnce(
  coordinatorPath,
  `  async function run(force = false) {
    if (disposed) return "retry_needed" as const;
    if (typeof navigator !== "undefined" && !navigator.onLine)`,
  `  async function run(
    force = false,
    ownsLane: () => boolean = () => true,
  ) {
    if (disposed || !ownsLane()) return "retry_needed" as const;
    if (typeof navigator !== "undefined" && !navigator.onLine)`,
);
replaceOnce(
  coordinatorPath,
  `    for (const operation of operations) {
      if (operation.state === "conflict") {`,
  `    for (const operation of operations) {
      if (!ownsLane()) return notify("retry_needed");
      if (operation.state === "conflict") {`,
);
replaceOnce(
  coordinatorPath,
  `      await updateActiveWorkoutOperation(operation, {
        state: "sending",
        attemptCount: operation.attemptCount + 1,
      });
      try {`,
  `      await updateActiveWorkoutOperation(operation, {
        state: "sending",
        attemptCount: operation.attemptCount + 1,
      });
      if (!ownsLane()) {
        await updateActiveWorkoutOperation(operation, {
          state: "pending",
          attemptCount: operation.attemptCount,
          nextRetryAt: operation.nextRetryAt,
        });
        return notify("retry_needed");
      }
      try {`,
);
replaceOnce(
  coordinatorPath,
  `    if (typeof localStorage === "undefined") return run(force);
    const acquireOrRenewLease = () => {
      localStorage.setItem(
        laneKey,
        JSON.stringify({ tabId, expiresAt: Date.now() + FLUSH_LEASE_MS }),
      );
    };
    const now = Date.now();
    try {
      const lease = JSON.parse(localStorage.getItem(laneKey) ?? "null") as {
        tabId?: unknown;
        expiresAt?: unknown;
      } | null;
      if (
        lease
        && lease.tabId !== tabId
        && typeof lease.expiresAt === "number"
        && lease.expiresAt > now
      ) return notify("retry_needed");
    } catch {
      // Invalid fallback lease data is replaced below.
    }
    acquireOrRenewLease();
    const renewal = setInterval(acquireOrRenewLease, FLUSH_LEASE_MS / 3);
    try {
      return await run(force);
    } finally {
      clearInterval(renewal);
      try {
        const lease = JSON.parse(localStorage.getItem(laneKey) ?? "null") as {
          tabId?: unknown;
        } | null;
        if (lease?.tabId === tabId) localStorage.removeItem(laneKey);
      } catch {
        localStorage.removeItem(laneKey);
      }
    }`,
  `    if (typeof localStorage === "undefined") return run(force);
    const lease = await acquireActiveWorkoutFallbackLease({
      storage: localStorage,
      key: laneKey,
      ownerId: tabId,
      leaseMs: FLUSH_LEASE_MS,
    });
    if (!lease) return notify("retry_needed");

    let leaseLost = false;
    const renewal = setInterval(() => {
      if (!lease.renew()) leaseLost = true;
    }, FLUSH_LEASE_MS / 3);
    try {
      return await run(force, () => !leaseLost && lease.owns());
    } finally {
      clearInterval(renewal);
      lease.release();
    }`,
);

const packagePath = "package.json";
const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
const scriptName = "test:active-workout:aw8-aw10";
const leaseTest = "lib/workouts/active-session-sync/fallback-lease.test.ts";
if (!packageJson.scripts?.[scriptName]) {
  throw new Error(`Missing ${scriptName} script.`);
}
if (!packageJson.scripts[scriptName].includes(leaseTest)) {
  packageJson.scripts[scriptName] = packageJson.scripts[scriptName]
    .replace(
      "lib/workouts/active-session-store/store.test.ts",
      `lib/workouts/active-session-store/store.test.ts ${leaseTest}`,
    );
}
writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
