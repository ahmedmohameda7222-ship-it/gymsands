from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    if old not in source:
        if new in source:
            return source
        raise SystemExit(f"{label} anchor changed")
    return source.replace(old, new, 1)


autosave_path = Path("services/database/workout-set-autosave.ts")
autosave = autosave_path.read_text(encoding="utf-8")
helper = '''

export function mountWorkoutSetAutosaveCoordinator<TSnapshot>(
  coordinatorRef: { current: WorkoutSetAutosaveCoordinator | null },
  getAdapter: () => WorkoutSetAutosaveAdapter<TSnapshot>,
  options: WorkoutSetAutosaveOptions = {},
) {
  const coordinator = createWorkoutSetAutosaveCoordinator(getAdapter, options);
  coordinatorRef.current = coordinator;
  return () => {
    coordinator.cancel();
    if (coordinatorRef.current === coordinator) {
      coordinatorRef.current = null;
    }
  };
}
'''
if "export function mountWorkoutSetAutosaveCoordinator<" not in autosave:
    autosave = autosave.rstrip() + helper
autosave_path.write_text(autosave, encoding="utf-8")

component_path = Path("components/workouts/workout-day-focus-session.tsx")
component = component_path.read_text(encoding="utf-8")
component = replace_once(
    component,
    '  createWorkoutSetAutosaveCoordinator,\n  type WorkoutSetAutosaveAdapter,',
    '  mountWorkoutSetAutosaveCoordinator,\n  type WorkoutSetAutosaveAdapter,',
    "autosave import",
)
old_effect = '''  useEffect(() => {
    autosaveAdapterRef.current = {
      getSnapshot: () => exerciseStatesRef.current,
      hasPendingWrites: hasPendingValidSetWrites,
      persistSnapshot: async (states) => {
        if (!session) return;
        const rows = buildLogRows(states, { pendingOnly: true, validOnly: true });
        if (!rows.length) return;
        await saveWorkoutSetLogs(session.id, rows);
        await updateWorkoutSessionDuration(
          session.id,
          Math.max(1, Math.ceil(elapsedSeconds / 60))
        );
      },
      acknowledgeSnapshot: (savedStates) => {
        setExerciseStates((current) => {
          const next = acknowledgeSetWrites(current, savedStates);
          exerciseStatesRef.current = next;
          return next;
        });
      },
      onFailure: (error) => {
        console.warn("Plaivra will retry the pending completed-set details.", error);
      }
    };

    if (autosaveCoordinatorRef.current == null) {
      autosaveCoordinatorRef.current = createWorkoutSetAutosaveCoordinator(() => {
        const adapter = autosaveAdapterRef.current;
        if (!adapter) throw new Error("Workout set autosave is unavailable.");
        return adapter;
      });
    }
  });'''
new_effect = '''  useEffect(() => {
    autosaveAdapterRef.current = {
      getSnapshot: () => exerciseStatesRef.current,
      hasPendingWrites: hasPendingValidSetWrites,
      persistSnapshot: async (states) => {
        if (!session) return;
        const rows = buildLogRows(states, { pendingOnly: true, validOnly: true });
        if (!rows.length) return;
        await saveWorkoutSetLogs(session.id, rows);
        await updateWorkoutSessionDuration(
          session.id,
          Math.max(1, Math.ceil(elapsedSeconds / 60))
        );
      },
      acknowledgeSnapshot: (savedStates) => {
        setExerciseStates((current) => {
          const next = acknowledgeSetWrites(current, savedStates);
          exerciseStatesRef.current = next;
          return next;
        });
      },
      onFailure: (error) => {
        console.warn("Plaivra will retry the pending completed-set details.", error);
      }
    };
  });

  useEffect(() => mountWorkoutSetAutosaveCoordinator(
    autosaveCoordinatorRef,
    () => {
      const adapter = autosaveAdapterRef.current;
      if (!adapter) throw new Error("Workout set autosave is unavailable.");
      return adapter;
    }
  ), []);'''
component = replace_once(component, old_effect, new_effect, "autosave lifecycle effect")
component = component.replace('''  useEffect(() => () => {
    autosaveCoordinatorRef.current?.cancel();
  }, []);

''', "", 1)
component_path.write_text(component, encoding="utf-8")

test_path = Path("services/database/workout-set-autosave.test.ts")
test = test_path.read_text(encoding="utf-8")
test = replace_once(
    test,
    'import { createWorkoutSetAutosaveCoordinator } from "./workout-set-autosave";',
    'import { createWorkoutSetAutosaveCoordinator, mountWorkoutSetAutosaveCoordinator } from "./workout-set-autosave";',
    "autosave test import",
)
strict_test = '''

  it("replaces a cancelled Strict Mode mount with a live coordinator", async () => {
    let current: Snapshot = { revision: 1, dirty: true };
    const persisted: Snapshot[] = [];
    const coordinatorRef: { current: ReturnType<typeof createWorkoutSetAutosaveCoordinator<Snapshot>> | null } = { current: null };
    const getAdapter = () => ({
      getSnapshot: () => current,
      hasPendingWrites: (snapshot: Snapshot) => snapshot.dirty,
      persistSnapshot: async (snapshot: Snapshot) => { persisted.push({ ...snapshot }); },
      acknowledgeSnapshot: (saved: Snapshot) => {
        if (current.revision === saved.revision) current = { ...current, dirty: false };
      },
    });

    const cleanupFirstMount = mountWorkoutSetAutosaveCoordinator(coordinatorRef, getAdapter);
    const cancelledCoordinator = coordinatorRef.current;
    cleanupFirstMount();
    expect(coordinatorRef.current).toBeNull();

    const cleanupSecondMount = mountWorkoutSetAutosaveCoordinator(coordinatorRef, getAdapter);
    expect(coordinatorRef.current).not.toBe(cancelledCoordinator);
    await coordinatorRef.current?.requestFlush();
    expect(persisted).toEqual([{ revision: 1, dirty: true }]);
    expect(current.dirty).toBe(false);
    cleanupSecondMount();
    expect(coordinatorRef.current).toBeNull();
  });
'''
if "replaces a cancelled Strict Mode mount" not in test:
    test = test.replace("\n});\n", strict_test + "\n});\n", 1)
test_path.write_text(test, encoding="utf-8")

integration_path = Path("services/database/workout-set-details.integration.test.ts")
integration = integration_path.read_text(encoding="utf-8")
integration = integration.replace(
    'expect(ui).toContain("createWorkoutSetAutosaveCoordinator");',
    'expect(ui).toContain("mountWorkoutSetAutosaveCoordinator");',
    1,
)
integration_path.write_text(integration, encoding="utf-8")

for path in [
    Path(".github/workflows/aw3b-autosave-lifecycle-repair.yml"),
    Path(".github/workflows/aw3b-autosave-lifecycle-pr-repair.yml"),
    Path(".github/workflows/aw3b-exact-quality-diagnostics-repair.yml"),
    Path("scripts/aw3b-autosave-lifecycle-repair.py"),
]:
    if path.exists():
        path.unlink()
