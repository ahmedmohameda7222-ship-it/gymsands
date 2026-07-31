const { readFileSync, writeFileSync } = require("node:fs");

function replaceExactly(path, before, after, expectedCount = 1) {
  const source = readFileSync(path, "utf8");
  const count = source.split(before).length - 1;
  if (count !== expectedCount) {
    throw new Error(`${path}: expected ${expectedCount} target(s), found ${count}`);
  }
  writeFileSync(path, source.split(before).join(after), "utf8");
}

const coordinatorPath = "lib/workouts/active-session-sync/coordinator.ts";
replaceExactly(
  coordinatorPath,
  `        if (\n          error instanceof ActiveSessionError\n          && error.code === "terminal_mutation_attempt"\n        ) {\n          await discardTerminalOperations();\n          return notify("online_synced");\n        }`,
  `        if (\n          error instanceof ActiveSessionError\n          && error.code === "terminal_mutation_attempt"\n        ) {\n          await discardTerminalOperations();\n          // Terminal server authority wins. Continue draining in case another\n          // local producer appended work while terminal proof was resolving.\n          continue;\n        }`
);
replaceExactly(
  coordinatorPath,
  `    input.onInvalidate?.();\n    return notify("online_synced");\n  }\n\n  async function runAsLaneLeader(force: boolean) {`,
  `    const remaining = await listActiveWorkoutOperations(\n      input.userId,\n      input.workoutSessionId,\n    );\n    if (remaining.length) return run(force, ownsLane);\n    input.onInvalidate?.();\n    return notify("online_synced");\n  }\n\n  async function runAsLaneLeader(force: boolean) {`
);
replaceExactly(
  coordinatorPath,
  `      return navigator.locks.request(\n        laneKey,\n        { mode: "exclusive", ifAvailable: true },\n        (lock) => lock ? run(force) : notify("retry_needed"),\n      );`,
  `      return navigator.locks.request(\n        laneKey,\n        { mode: "exclusive" },\n        () => run(force),\n      );`
);
replaceExactly(
  coordinatorPath,
  `      const remaining = await nextConflict();\n      if (remaining) return notify("data_conflict");\n      return strategy === "local"\n        ? runAsLaneLeader(true)\n        : notify("online_synced");`,
  `      const remaining = await nextConflict();\n      if (remaining) return notify("data_conflict");\n      // Both resolution choices must drain companion operations before the\n      // UI may claim that the durable lane is synchronized.\n      return runAsLaneLeader(true);`
);

const testPath = "lib/product/active-workout-aw10-closure.test.ts";
replaceExactly(
  testPath,
  `    expect(coordinator).toMatch(\n      /ActiveSessionRevisionConflictError[\\s\\S]*lastErrorCode: "revision_conflict_rehydrate"[\\s\\S]*continue;/,\n    );\n    expect(runner).toContain('takeoverButton instanceof HTMLButtonElement && !takeoverButton.disabled');`,
  `    expect(coordinator).toMatch(\n      /ActiveSessionRevisionConflictError[\\s\\S]*lastErrorCode: "revision_conflict_rehydrate"[\\s\\S]*continue;/,\n    );\n    expect(coordinator).not.toContain('ifAvailable: true');\n    expect(coordinator).toContain('{ mode: "exclusive" }');\n    expect(coordinator).toContain('if (remaining.length) return run(force, ownsLane);');\n    expect(coordinator).toContain('Both resolution choices must drain companion operations');\n    expect(coordinator).toContain('Terminal server authority wins');\n    expect(runner).toContain('takeoverButton instanceof HTMLButtonElement && !takeoverButton.disabled');`
);
