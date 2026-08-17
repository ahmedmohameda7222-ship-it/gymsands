from pathlib import Path

path = Path("components/workouts/active-workout/active-workout-core-session-implementation.tsx")
text = path.read_text()

old_import = 'import { activeWorkoutStorageIdentities } from "@/components/workouts/active-workout/active-workout-source-compatibility";\n'
new_import = old_import + 'import { resolveActiveWorkoutReliabilityPresentation } from "@/components/workouts/active-workout/active-workout-reliability-priority";\n'
if text.count(old_import) != 1:
    raise SystemExit(f"source compatibility import count={text.count(old_import)}")
text = text.replace(old_import, new_import, 1)

start = text.index('  const syncNotice = syncState === "online_synced" || controllerConflictDeviceId ? null : (')
end = text.index('\n\n  const allQuickActions = buildActiveWorkoutQuickActions({', start)
replacement = '''  const reliabilityPresentation = resolveActiveWorkoutReliabilityPresentation({
    syncState,
    tabLeader,
    controllerConflictDeviceId
  });
  const syncNotice = reliabilityPresentation.showStandaloneSyncStatus && reliabilityPresentation.nonBlockingSyncState ? (
    <section
      data-aw9-sync-state={reliabilityPresentation.nonBlockingSyncState}
      data-aw9-reliability-sync-status
      role="status"
      aria-live="polite"
      className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[60] mx-auto max-w-xl rounded-[14px] border border-border/70 bg-background/95 px-3 py-2 shadow-md backdrop-blur lg:bottom-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{tr(`sync.${reliabilityPresentation.nonBlockingSyncState}`)}</p>
          <p className="text-xs text-muted-foreground">{tr("sync.pendingCount", { count: pendingOperationCount })}</p>
        </div>
        {reliabilityPresentation.nonBlockingSyncState === "retry_needed" ? (
          <Button type="button" variant="outline" size="sm" className="min-h-9 shrink-0" onClick={() => { void activeSessionStoreRef.current?.retryPendingTransport().catch(() => undefined); }}>{tr("common.retry")}</Button>
        ) : null}
      </div>
    </section>
  ) : null;'''
text = text[:start] + replacement + text[end:]

back_marker = '''  const deviceConflictBackHref = userId
    ? readPreviousActiveWorkoutRoute(userId) ?? (sourceKind === "plan-day" ? "/my-workout/plans" : "/workouts")
    : "/workouts";
'''
if text.count(back_marker) != 1:
    raise SystemExit(f"device back marker count={text.count(back_marker)}")
blocking = back_marker + '''  const blockingReliabilityNotice = reliabilityPresentation.blockingState ? (
    <section
      data-aw9-reliability-blocking={reliabilityPresentation.blockingState}
      data-aw9-tab-conflict={reliabilityPresentation.blockingState === "tab_conflict" ? "true" : undefined}
      data-aw9-device-conflict={reliabilityPresentation.blockingState === "device_conflict" ? "true" : undefined}
      data-aw9-data-conflict={reliabilityPresentation.blockingState === "data_conflict" ? "true" : undefined}
      data-aw9-sync-state={syncState !== "online_synced" ? syncState : undefined}
      role="status"
      aria-live="polite"
      className="fixed inset-x-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[70] mx-auto max-h-[calc(100dvh-7.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] max-w-xl overflow-y-auto rounded-[18px] border border-border/70 bg-background/95 p-4 shadow-lg backdrop-blur"
    >
      {reliabilityPresentation.blockingState === "data_conflict" ? (
        <>
          <h2 className="font-semibold">{tr("sync.data_conflict")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{tr("sync.pendingCount", { count: pendingOperationCount })}</p>
          {dataConflict ? (
            <div className="mt-3 rounded-xl bg-muted/55 p-3 text-sm">
              <p className="font-semibold">{tr("sync.setConflict", { set: formatters.integer(dataConflict.local.setNumber), exercise: isolateBidiText(dataConflict.local.exerciseName) })}</p>
              <p className="mt-1 text-muted-foreground">{tr("sync.thisDevice")}: {tr("sync.setValues", { weight: formatters.decimal(dataConflict.local.weightKg ?? 0), reps: formatters.integer(dataConflict.local.reps ?? 0) })}</p>
              <p className="text-muted-foreground">{tr("sync.server")}: {dataConflict.server ? tr("sync.setValues", { weight: formatters.decimal(dataConflict.server.weight_kg ?? 0), reps: formatters.integer(dataConflict.server.reps ?? 0) }) : tr("completion.metricUnavailable")}</p>
            </div>
          ) : null}
          <div className="mt-3 grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
            <Button type="button" variant="outline" className="min-h-11" onClick={() => { void activeSessionStoreRef.current?.resolveDataConflict("server").catch(() => undefined); }}>{tr("sync.keepServer")}</Button>
            <Button type="button" className="min-h-11" onClick={() => { void activeSessionStoreRef.current?.resolveDataConflict("local").catch(() => undefined); }}>{tr("sync.useLocal")}</Button>
          </div>
        </>
      ) : reliabilityPresentation.blockingState === "device_conflict" ? (
        <>
          <h2 className="font-semibold">{controllerConflictDeviceId ? tr("multiDevice.activeElsewhere") : tr("sync.device_conflict")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{controllerConflictDeviceId ? tr("multiDevice.viewOnly") : tr("sync.pendingCount", { count: pendingOperationCount })}</p>
          {reliabilityPresentation.nonBlockingSyncState ? (
            <p data-aw9-reliability-sync-substatus className="mt-1 text-xs text-muted-foreground">{tr(`sync.${reliabilityPresentation.nonBlockingSyncState}`)}</p>
          ) : null}
          <div className="mt-3 grid gap-2">
            {controllerConflictDeviceId ? (
              <>
                <Button type="button" variant="outline" className="min-h-11 w-full" onClick={() => { document.querySelector("[data-aw5-execution-shell]")?.scrollIntoView({ block: "start" }); }}>{tr("multiDevice.viewCurrent")}</Button>
                <Button type="button" className="min-h-11 w-full" onClick={() => setTakeoverConfirmationOpen(true)} disabled={isSaving || (typeof navigator !== "undefined" && !navigator.onLine)}>{tr("multiDevice.takeOver")}</Button>
                <Button asChild variant="ghost" className="min-h-11 w-full"><Link href={deviceConflictBackHref} prefetch={false}>{tr("multiDevice.goBack")}</Link></Button>
              </>
            ) : (
              <Button type="button" variant="outline" className="min-h-11 w-full" onClick={() => { void activeSessionStoreRef.current?.retryPendingTransport().catch(() => undefined); }}>{tr("common.retry")}</Button>
            )}
          </div>
        </>
      ) : (
        <>
          <h2 className="font-semibold">{tr("multiDevice.sameDeviceTab")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{tr("multiDevice.viewOnly")}</p>
          {reliabilityPresentation.nonBlockingSyncState ? (
            <p data-aw9-reliability-sync-substatus className="mt-1 text-xs text-muted-foreground">{tr(`sync.${reliabilityPresentation.nonBlockingSyncState}`)} · {tr("sync.pendingCount", { count: pendingOperationCount })}</p>
          ) : null}
          <Button type="button" variant="outline" className="mt-3 min-h-11 w-full" onClick={() => { const leadership = tabLeadershipRef.current; if (!leadership) return; void leadership.acquire(true).then(setTabLeader); }}>{tr("multiDevice.continueThisTab")}</Button>
        </>
      )}
    </section>
  ) : null;
  const takeoverConfirmationDialog = (
    <Dialog open={takeoverConfirmationOpen} onOpenChange={setTakeoverConfirmationOpen}>
      <DialogContent data-aw9-takeover-confirmation className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{tr("multiDevice.takeoverConfirmTitle")}</DialogTitle>
          <DialogDescription>{tr("multiDevice.takeoverConfirmDescription")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" className="min-h-12" onClick={() => setTakeoverConfirmationOpen(false)} disabled={isSaving}>{tr("common.back")}</Button>
          <Button type="button" className="min-h-12" onClick={() => { setTakeoverConfirmationOpen(false); void takeOverWorkout(); }} disabled={isSaving}>{tr("multiDevice.confirmTakeover")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
'''
text = text.replace(back_marker, blocking, 1)

review_old = '''      <div data-active-workout-controller className="contents">
        {syncNotice}
        {!tabLeader ? (
          <section data-aw9-tab-conflict role="status" className="fixed inset-x-3 top-3 z-[64] mx-auto max-w-xl rounded-[18px] border border-border/70 bg-background/95 p-4 shadow-lg backdrop-blur">
            <h2 className="font-semibold">{tr("multiDevice.sameDeviceTab")}</h2>
            <Button type="button" variant="outline" className="mt-3 min-h-11 w-full" onClick={() => { const leadership = tabLeadershipRef.current; if (!leadership) return; void leadership.acquire(true).then(setTabLeader); }}>{tr("multiDevice.continueThisTab")}</Button>
          </section>
        ) : null}
        <ActiveWorkoutReviewBridge'''
review_new = '''      <div data-active-workout-controller className="contents">
        {syncNotice}
        {blockingReliabilityNotice}
        {takeoverConfirmationDialog}
        <ActiveWorkoutReviewBridge'''
if text.count(review_old) != 1:
    raise SystemExit(f"review reliability block count={text.count(review_old)}")
text = text.replace(review_old, review_new, 1)

normal_start = text.index('  return (\n    <div data-active-workout-controller className="contents">\n      {syncNotice}\n', text.index('  if (completedSummary || reviewOpen)'))
dialog_start = text.index('      <Dialog open={takeoverConfirmationOpen}', normal_start)
dialog_end_marker = '      </Dialog>\n\n      <Dialog open={cancelConfirmationOpen}'
dialog_end = text.index(dialog_end_marker, dialog_start) + len('      </Dialog>\n\n')
normal_prefix_end = text.index('      <Dialog open={takeoverConfirmationOpen}', normal_start)
old_prefix = text[normal_start:normal_prefix_end]
new_prefix = '''  return (
    <div data-active-workout-controller className="contents">
      {syncNotice}
      {blockingReliabilityNotice}
      {takeoverConfirmationDialog}

'''
text = text[:normal_start] + new_prefix + text[dialog_start:]
# Remove the now-duplicated inline takeover dialog.
dialog_start = text.index('      <Dialog open={takeoverConfirmationOpen}', normal_start)
dialog_end = text.index(dialog_end_marker, dialog_start) + len('      </Dialog>\n\n')
text = text[:dialog_start] + text[dialog_end:]

path.write_text(text)
