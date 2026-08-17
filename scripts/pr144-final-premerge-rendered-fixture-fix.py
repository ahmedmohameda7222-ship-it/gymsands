from pathlib import Path

path = Path("scripts/run-active-workout-final-premerge-qa.mjs")
text = path.read_text()

marker = '''async function reliabilityGeometry(page) {
'''
helper = '''async function preservePendingControllerAuthority(page, controllerDeviceId) {
  await openDatabase(page);
  await page.evaluate(async (nextController) => {
    const request = indexedDB.open("plaivra-active-workout-v1", 2);
    const database = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction("operations", "readwrite");
    const store = transaction.objectStore("operations");
    const allRequest = store.getAll();
    const all = await new Promise((resolve, reject) => {
      allRequest.onsuccess = () => resolve(allRequest.result);
      allRequest.onerror = () => reject(allRequest.error);
    });
    for (const operation of all) {
      if (operation.state === "applied" || operation.state === "discarded") continue;
      let payload = operation.payload;
      if (payload?.kind === "set_write") {
        payload = { ...payload, controllerDeviceId: nextController };
      } else if (payload?.kind === "command" && payload.request) {
        payload = {
          ...payload,
          request: {
            ...payload.request,
            payload: {
              ...(payload.request.payload ?? {}),
              controller_device_id: nextController,
            },
          },
        };
      }
      store.put({ ...operation, payload, updatedAt: new Date().toISOString() });
    }
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
  }, controllerDeviceId);
}

'''
if text.count(marker) != 1:
    raise SystemExit(f"reliabilityGeometry marker count={text.count(marker)}")
text = text.replace(marker, helper + marker, 1)

old_tab = '''    check(await second.getByRole("button", { name: /continue in this tab/i }).count() === 1, "Continue in this tab action is missing");
    check(await second.locator("#active-set-reps").isDisabled(), "non-controller tab still allows execution mutation");
'''
new_tab = '''    check(await second.getByRole("button", { name: /continue in this tab/i }).count() === 1, "Continue in this tab action is missing");
    const secondTabReps = second.locator("#active-set-reps");
    const secondTabRepsCount = await secondTabReps.count();
    check(secondTabRepsCount === 0 || await secondTabReps.isDisabled(), "non-controller tab still allows execution mutation");
'''
if text.count(old_tab) != 1:
    raise SystemExit(f"tab mutation assertion count={text.count(old_tab)}")
text = text.replace(old_tab, new_tab, 1)

old_device = '''    await waitForSyncState(page, "offline_saved");
    await mutateCachedController(page, OTHER_DEVICE_ID);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45_000 });
'''
new_device = '''    await waitForSyncState(page, "offline_saved");
    await mutateCachedController(page, OTHER_DEVICE_ID);
    // The queued offline projection must use the same simulated authoritative
    // controller or it would legitimately project the old local controller back
    // over the cache during hydration and erase the intended combined fixture.
    await preservePendingControllerAuthority(page, OTHER_DEVICE_ID);
    await setOffline(page, true, false);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45_000 });
'''
if text.count(old_device) != 1:
    raise SystemExit(f"device fixture count={text.count(old_device)}")
text = text.replace(old_device, new_device, 1)

path.write_text(text)
