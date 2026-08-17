from pathlib import Path

path = Path("scripts/run-active-workout-final-premerge-qa.mjs")
text = path.read_text()

marker = '''async function reliabilityGeometry(page) {
'''
if text.count(marker) != 1:
    raise SystemExit(f"reliabilityGeometry marker count={text.count(marker)}")

helper = r'''async function readDurableReliabilityFixture(page) {
  await openDatabase(page);
  return page.evaluate(async () => {
    const request = indexedDB.open("plaivra-active-workout-v1", 2);
    const database = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const readAll = (storeName) => new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, "readonly");
      const allRequest = transaction.objectStore(storeName).getAll();
      allRequest.onsuccess = () => resolve(allRequest.result);
      allRequest.onerror = () => reject(allRequest.error);
    });
    const caches = await readAll("session_snapshots");
    const operations = await readAll("operations");
    database.close();
    const cache = caches[0] ?? null;
    const pending = operations.filter((operation) =>
      operation.state !== "applied" && operation.state !== "discarded"
    );
    return {
      cacheControllerDeviceId: cache?.controllerDeviceId ?? null,
      executionControllerDeviceId: cache?.executionState?.controller_device_id ?? null,
      prescriptionCount: Array.isArray(cache?.prescription) ? cache.prescription.length : 0,
      pendingCount: pending.length,
      pendingControllers: pending.map((operation) => {
        if (operation.payload?.kind === "set_write") {
          return operation.payload.controllerDeviceId ?? null;
        }
        if (operation.payload?.kind === "command") {
          return operation.payload.request?.payload?.controller_device_id ?? null;
        }
        return null;
      }),
    };
  });
}

function durableDeviceConflictFixtureReady(snapshot, controllerDeviceId) {
  return snapshot.cacheControllerDeviceId === controllerDeviceId
    && snapshot.executionControllerDeviceId === controllerDeviceId
    && snapshot.prescriptionCount > 0
    && snapshot.pendingCount > 0
    && snapshot.pendingControllers.every((controller) => controller === controllerDeviceId);
}

async function stabilizeDurableDeviceConflictFixture(page, controllerDeviceId) {
  // Store publish() persists its canonical cache asynchronously. Wait for the
  // offline-save write to settle before editing the durable fixture, then prove
  // the simulated controller authority remains stable across two observations.
  await page.waitForTimeout(300);
  let latest = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await mutateCachedController(page, controllerDeviceId);
    await preservePendingControllerAuthority(page, controllerDeviceId);
    await page.waitForTimeout(100);
    const first = await readDurableReliabilityFixture(page);
    await page.waitForTimeout(100);
    const second = await readDurableReliabilityFixture(page);
    latest = second;
    if (
      durableDeviceConflictFixtureReady(first, controllerDeviceId)
      && durableDeviceConflictFixtureReady(second, controllerDeviceId)
    ) return second;
  }
  throw new Error(`durable device-conflict fixture did not stabilize: ${JSON.stringify(latest)}`);
}

async function waitForDeviceConflictShell(page, result) {
  try {
    await waitForActiveShell(page, { allowTabConflict: true });
  } catch (error) {
    const diagnostics = await page.evaluate(() => ({
      href: location.href,
      bodyText: document.body?.innerText?.slice(0, 1200) ?? "",
      entryLoading: Boolean(document.querySelector("[data-aw-entry-loading]")),
      entryError: Boolean(document.querySelector("[data-aw-entry-error]")),
      executionShell: Boolean(document.querySelector("[data-aw5-execution-shell]")),
      reliabilityBlocker: document.querySelector("[data-aw9-reliability-blocking]")?.getAttribute("data-aw9-reliability-blocking") ?? null,
      syncState: document.querySelector("[data-aw9-sync-state]")?.getAttribute("data-aw9-sync-state") ?? null,
    }));
    const screenshot = path.join(evidenceDir, `${result.name}-bootstrap-failure.png`);
    await page.screenshot({ path: screenshot, fullPage: false, animations: "disabled" }).catch(() => undefined);
    result.screenshot = path.relative(rootEvidenceDir, screenshot);
    throw new Error(`${error instanceof Error ? error.message : String(error)} bootstrap diagnostics: ${JSON.stringify(diagnostics)}`);
  }
}

'''
text = text.replace(marker, helper + marker, 1)

old = '''    await waitForSyncState(page, "offline_saved");
    await mutateCachedController(page, OTHER_DEVICE_ID);
    // The queued offline projection must use the same simulated authoritative
    // controller or it would legitimately project the old local controller back
    // over the cache during hydration and erase the intended combined fixture.
    await preservePendingControllerAuthority(page, OTHER_DEVICE_ID);
    await setOffline(page, true, false);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45_000 });
    await waitForActiveShell(page, { allowTabConflict: true });
'''
new = '''    await waitForSyncState(page, "offline_saved");
    // The combined fixture edits only durable QA state. First let the store's
    // asynchronous canonical cache write settle, then require the simulated
    // controller plus every queued controller-bearing operation to be stable.
    await stabilizeDurableDeviceConflictFixture(page, OTHER_DEVICE_ID);
    await setOffline(page, true, false);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45_000 });
    await waitForDeviceConflictShell(page, result);
'''
if text.count(old) != 1:
    raise SystemExit(f"device scenario block count={text.count(old)}")
text = text.replace(old, new, 1)

old_assertion = '''    check(await page.locator("#active-set-reps").isDisabled(), "non-controller device still allows execution mutation");
'''
new_assertion = '''    const enabledExecutionMutations = await page.locator([
      "#active-set-reps:not(:disabled)",
      "#active-set-weight:not(:disabled)",
      "[data-aw5-primary-action]:not(:disabled)",
      "[data-aw5-rest-presets] button:not(:disabled)",
      "[data-aw5-set-path] button:not(:disabled)",
    ].join(", ")).count();
    check(enabledExecutionMutations === 0, `non-controller device exposes ${enabledExecutionMutations} enabled execution mutation controls`);
'''
if text.count(old_assertion) != 1:
    raise SystemExit(f"device mutation assertion count={text.count(old_assertion)}")
text = text.replace(old_assertion, new_assertion, 1)
path.write_text(text)
