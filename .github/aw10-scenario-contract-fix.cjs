const { readFileSync, writeFileSync } = require("node:fs");

function replaceExactly(path, before, after, expectedCount = 1) {
  const source = readFileSync(path, "utf8");
  const count = source.split(before).length - 1;
  if (count !== expectedCount) {
    throw new Error(`${path}: expected ${expectedCount} target(s), found ${count}`);
  }
  writeFileSync(path, source.split(before).join(after), "utf8");
}

const runnerPath = "scripts/run-aw10-active-workout-closure-qa.mjs";
replaceExactly(
  runnerPath,
  `async function openReview(page) {
  await visible(page, "[data-aw5-finish-action]").click({ timeout: 10_000 });
  await visible(page, "[data-aw7-review-surface]").waitFor({
    state: "visible",
    timeout: 15_000
  });
}`,
  `async function openReview(page) {
  const mobileFinish = page.locator("[data-aw5-finish-action]:visible");
  if (await mobileFinish.count()) {
    await mobileFinish.first().click({ timeout: 10_000 });
  } else {
    await page.getByRole("button", { name: "Finish", exact: true })
      .filter({ visible: true })
      .last()
      .click({ timeout: 10_000 });
  }
  await visible(page, "[data-aw7-review-surface]").waitFor({
    state: "visible",
    timeout: 15_000
  });
}`
);
replaceExactly(
  runnerPath,
  `async function finishPartial(page) {
  const finish = page.locator("[data-aw7-review-actions] button:visible").last();
  await finish.click({ timeout: 10_000 });
  await visible(page, "[data-aw7-partial-confirmation]").waitFor({
    state: "visible",
    timeout: 10_000
  });
  await page.locator("[data-aw7-partial-confirmation] button:visible").last()
    .click({ timeout: 10_000 });
}`,
  `async function finishPartial(page) {
  await page.getByRole("button", { name: "Finish partial workout", exact: true })
    .click({ timeout: 10_000 });
  await visible(page, "[data-aw7-partial-confirmation]").waitFor({
    state: "visible",
    timeout: 10_000
  });
  await page.getByRole("button", { name: "Finish anyway", exact: true })
    .click({ timeout: 10_000 });
}`
);
replaceExactly(
  runnerPath,
  `    const transaction = database.transaction("operations", "readonly");
    const countRequest = transaction.objectStore("operations").count();
    const count = await new Promise((resolve, reject) => {
      countRequest.onsuccess = () => resolve(countRequest.result);
      countRequest.onerror = () => reject(countRequest.error);
    });
    database.close();
    return count;`,
  `    const transaction = database.transaction("operations", "readonly");
    const allRequest = transaction.objectStore("operations").getAll();
    const operations = await new Promise((resolve, reject) => {
      allRequest.onsuccess = () => resolve(allRequest.result);
      allRequest.onerror = () => reject(allRequest.error);
    });
    database.close();
    return operations.filter((operation) =>
      operation.state !== "applied" && operation.state !== "discarded"
    ).length;`,
  2
);
replaceExactly(
  runnerPath,
  `      await setOffline(page, false);
      await page.waitForTimeout(250);`,
  `      await setOffline(page, false, false);
      await page.waitForTimeout(250);`
);

const storePath = "lib/workouts/active-session-store/store-core.ts";
replaceExactly(
  storePath,
  `    void sync.reconcile()
      .then(() => hydrate({ force: true, reconcile: false }))
      .catch(() => undefined);`,
  `    void sync.reconcile()
      .then((state) => {
        if (state !== "online_synced") return;
        return hydrate({ force: true, reconcile: false });
      })
      .catch(() => undefined);`
);

const testPath = "lib/product/active-workout-aw10-closure.test.ts";
replaceExactly(
  testPath,
  `const packageJson = JSON.parse(readFileSync("package.json", "utf8"));`,
  `const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const store = readFileSync("lib/workouts/active-session-store/store-core.ts", "utf8");`
);
replaceExactly(
  testPath,
  `    expect(runner).toContain(
      'controllerCount: document.querySelectorAll("[data-active-workout-controller]").length',
    );`,
  `    expect(runner).toContain(
      'controllerCount: document.querySelectorAll("[data-active-workout-controller]").length',
    );
    expect(runner).toContain('{ name: "Finish anyway", exact: true }');
    expect(runner).toContain('operation.state !== "applied" && operation.state !== "discarded"');
    expect(runner).toContain('setOffline(page, false, false)');
    expect(store).toContain('if (state !== "online_synced") return;');`
);
