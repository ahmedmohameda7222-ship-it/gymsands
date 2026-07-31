const { readFileSync, writeFileSync } = require("node:fs");

function replaceExactly(path, before, after, expectedCount = 1) {
  const source = readFileSync(path, "utf8");
  const count = source.split(before).length - 1;
  if (count !== expectedCount) {
    throw new Error(`${path}: expected ${expectedCount} target(s), found ${count}`);
  }
  writeFileSync(path, source.split(before).join(after), "utf8");
}

const storePath = "lib/workouts/active-session-store/store-core.ts";
replaceExactly(
  storePath,
  `    void sync.reconcile()
      .then((state) => {`,
  `    void sync.reconcile({ force: true })
      .then((state) => {`
);

const coordinatorPath = "lib/workouts/active-session-sync/coordinator.ts";
replaceExactly(
  coordinatorPath,
  `        if (error instanceof ActiveSessionRevisionConflictError) {
          await updateActiveWorkoutOperation(operation, {
            state: "discarded",
            nextRetryAt: null,
            lastErrorCode: "revision_conflict_rehydrate",
          });
          input.onInvalidate?.();
          return notify("retry_needed");
        }`,
  `        if (error instanceof ActiveSessionRevisionConflictError) {
          await updateActiveWorkoutOperation(operation, {
            state: "discarded",
            nextRetryAt: null,
            lastErrorCode: "revision_conflict_rehydrate",
          });
          // The server execution state wins, but this stale command must not
          // block independent durable operations that follow it in the lane.
          continue;
        }`
);

const runnerPath = "scripts/run-aw10-active-workout-closure-qa.mjs";
replaceExactly(
  runnerPath,
  `      await setOffline(page, false, false);
      await page.waitForTimeout(250);
      if (await takeover.isDisabled()) {
        throw new Error("Takeover stayed disabled after reconnect.");
      }
      await takeover.click({ timeout: 10_000 });`,
  `      await setOffline(page, false, false);
      await page.waitForFunction(() => {
        const buttons = document.querySelectorAll("[data-aw9-device-conflict] button");
        const takeoverButton = buttons.item(1);
        return takeoverButton instanceof HTMLButtonElement && !takeoverButton.disabled;
      }, undefined, { timeout: 3_000 });
      await takeover.click({ timeout: 10_000 });`
);

const testPath = "lib/product/active-workout-aw10-closure.test.ts";
replaceExactly(
  testPath,
  `const store = readFileSync("lib/workouts/active-session-store/store-core.ts", "utf8");`,
  `const store = readFileSync("lib/workouts/active-session-store/store-core.ts", "utf8");
const coordinator = readFileSync("lib/workouts/active-session-sync/coordinator.ts", "utf8");`
);
replaceExactly(
  testPath,
  `    expect(store).toContain('if (state !== "online_synced") return;');`,
  `    expect(store).toContain('if (state !== "online_synced") return;');
    expect(store).toContain('sync.reconcile({ force: true })');
    expect(coordinator).toContain('stale command must not');
    expect(coordinator).toMatch(
      /ActiveSessionRevisionConflictError[\\s\\S]*lastErrorCode: "revision_conflict_rehydrate"[\\s\\S]*continue;/,
    );
    expect(runner).toContain('takeoverButton instanceof HTMLButtonElement && !takeoverButton.disabled');`
);
