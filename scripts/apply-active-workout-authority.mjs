import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function write(path, value) {
  fs.writeFileSync(path, value);
}

function replaceOnce(path, before, after, marker = after) {
  let source = read(path);
  if (source.includes(marker)) return false;
  if (!source.includes(before)) {
    throw new Error(`Patch anchor not found in ${path}: ${before.slice(0, 120)}`);
  }
  source = source.replace(before, after);
  write(path, source);
  return true;
}

function replaceAll(path, before, after) {
  let source = read(path);
  if (!source.includes(before)) return false;
  source = source.split(before).join(after);
  write(path, source);
  return true;
}

function patchIndexedDb() {
  const path = "lib/workouts/active-session-sync/indexed-db.ts";
  replaceOnce(path,
    'const OPERATION_STORE = "operations";\n',
    'const OPERATION_STORE = "operations";\nconst SET_DRAFT_STORE = "set_drafts";\n',
    'const SET_DRAFT_STORE = "set_drafts";');
  replaceOnce(path,
    'const request = indexedDB.open(ACTIVE_WORKOUT_INDEXED_DB_NAME, 1);',
    'const request = indexedDB.open(ACTIVE_WORKOUT_INDEXED_DB_NAME, 2);',
    'indexedDB.open(ACTIVE_WORKOUT_INDEXED_DB_NAME, 2)');
  replaceOnce(path,
`    if (!database.objectStoreNames.contains(OPERATION_STORE)) {
      const operations = database.createObjectStore(OPERATION_STORE, {
        keyPath: "id",
      });
      operations.createIndex(
        "by_session_sequence",
        ["userId", "workoutSessionId", "sequence"],
        { unique: true },
      );
      operations.createIndex("by_user", "userId");
      operations.createIndex("by_state", "state");
    }
`,
`    if (!database.objectStoreNames.contains(OPERATION_STORE)) {
      const operations = database.createObjectStore(OPERATION_STORE, {
        keyPath: "id",
      });
      operations.createIndex(
        "by_session_sequence",
        ["userId", "workoutSessionId", "sequence"],
        { unique: true },
      );
      operations.createIndex("by_user", "userId");
      operations.createIndex("by_state", "state");
    }
    if (!database.objectStoreNames.contains(SET_DRAFT_STORE)) {
      const drafts = database.createObjectStore(SET_DRAFT_STORE, { keyPath: "key" });
      drafts.createIndex("by_session", ["userId", "workoutSessionId"]);
      drafts.createIndex("by_user", "userId");
      drafts.createIndex("by_expiry", "expiresAt");
    }
`,
    'drafts.createIndex("by_session", ["userId", "workoutSessionId"]);');

  replaceAll(path, '[SESSION_STORE, OPERATION_STORE],', '[SESSION_STORE, OPERATION_STORE, SET_DRAFT_STORE],');
  replaceOnce(path,
`  for (const operation of operations) {
    if (
      operation.userId === userId &&
      operation.workoutSessionId === workoutSessionId
    )
      transaction.objectStore(OPERATION_STORE).delete(operation.id);
  }
`,
`  for (const operation of operations) {
    if (
      operation.userId === userId &&
      operation.workoutSessionId === workoutSessionId
    )
      transaction.objectStore(OPERATION_STORE).delete(operation.id);
  }
  const drafts = await requestResult(
    transaction.objectStore(SET_DRAFT_STORE).index("by_session").getAll(
      IDBKeyRange.only([userId, workoutSessionId]),
    ),
  ) as Array<{ key: string }>;
  for (const draft of drafts) transaction.objectStore(SET_DRAFT_STORE).delete(draft.key);
`,
    'transaction.objectStore(SET_DRAFT_STORE).index("by_session")');
  replaceOnce(path,
`  const operations = (await requestResult(
    transaction.objectStore(OPERATION_STORE).getAll(),
  )) as ActiveWorkoutOperation[];
`,
`  const operations = (await requestResult(
    transaction.objectStore(OPERATION_STORE).getAll(),
  )) as ActiveWorkoutOperation[];
  const drafts = (await requestResult(
    transaction.objectStore(SET_DRAFT_STORE).index("by_user").getAll(userId),
  )) as Array<{ key: string }>;
`,
    'transaction.objectStore(SET_DRAFT_STORE).index("by_user").getAll(userId)');
  replaceOnce(path,
`  for (const operation of operations)
    if (operation.userId === userId)
      transaction.objectStore(OPERATION_STORE).delete(operation.id);
`,
`  for (const operation of operations)
    if (operation.userId === userId)
      transaction.objectStore(OPERATION_STORE).delete(operation.id);
  for (const draft of drafts)
    transaction.objectStore(SET_DRAFT_STORE).delete(draft.key);
`,
    'for (const draft of drafts)\n    transaction.objectStore(SET_DRAFT_STORE).delete(draft.key);');
  replaceOnce(path,
`  const operationStore = transaction.objectStore(OPERATION_STORE);
`,
`  const operationStore = transaction.objectStore(OPERATION_STORE);
  const draftStore = transaction.objectStore(SET_DRAFT_STORE);
`,
    'const draftStore = transaction.objectStore(SET_DRAFT_STORE);');
  replaceOnce(path,
`  for (const operation of operations) {
    const key = activeWorkoutSessionCacheKey(
      operation.userId,
      operation.workoutSessionId,
    );
    if (
      expiredKeys.has(key)
      || Date.parse(operation.createdAt) + ACTIVE_WORKOUT_OFFLINE_RETENTION_MS <= now
    ) {
      operationStore.delete(operation.id);
    }
  }
`,
`  for (const operation of operations) {
    const key = activeWorkoutSessionCacheKey(
      operation.userId,
      operation.workoutSessionId,
    );
    if (
      expiredKeys.has(key)
      || Date.parse(operation.createdAt) + ACTIVE_WORKOUT_OFFLINE_RETENTION_MS <= now
    ) {
      operationStore.delete(operation.id);
    }
  }
  const expiredDrafts = await requestResult(
    draftStore.index("by_expiry").getAll(IDBKeyRange.upperBound(new Date(now).toISOString())),
  ) as Array<{ key: string }>;
  for (const draft of expiredDrafts) draftStore.delete(draft.key);
`,
    'const expiredDrafts = await requestResult(');
}

function patchSetValidation() {
  const path = "components/workouts/active-workout/active-workout-ui-model.ts";
  replaceOnce(path,
    '  weightError: "invalid" | null;',
    '  weightError: "required" | "invalid" | null;',
    'weightError: "required" | "invalid" | null;');
  replaceOnce(path,
    '  const weightError = weightKg === null || weightKg < 0 ? "invalid" : null;',
    '  const weightError = weightKg === null ? "required" : weightKg < 0 ? "invalid" : null;',
    'weightKg === null ? "required"');
}

function patchShellSetPath() {
  const path = "components/workouts/active-workout/active-workout-execution-shell.tsx";
  replaceAll(path, 'item.setNumber', 'item.number');
  replaceOnce(path,
    'disabled={busy || item.state === "completed" || item.state === "active"}',
    'disabled={busy || item.state === "active"}',
    'disabled={busy || item.state === "active"}');
}

function patchMinimizeVisual() {
  const path = "components/workouts/workout-session-screen.tsx";
  replaceOnce(path,
`        variant="outline"
        size="icon"
`,
`        variant="ghost"
        size="icon"
`,
    'variant="ghost"\n        size="icon"');
  replaceOnce(path,
    'className="absolute start-3 top-3 z-[40] h-12 w-12 rounded-full bg-card/95 shadow-lg backdrop-blur sm:start-5 sm:top-5 lg:start-1"',
    'className="absolute start-3 top-3 z-[40] h-12 w-12 rounded-none border-0 bg-transparent shadow-none hover:bg-transparent focus-visible:ring-2 focus-visible:ring-ring sm:start-5 sm:top-5 lg:start-1"',
    'rounded-none border-0 bg-transparent shadow-none');
}

function patchSettingsModel() {
  const path = "services/database/user-settings.ts";
  replaceOnce(path,
`  largeTextMode: boolean;
  daysPerWeek: string | null;
`,
`  largeTextMode: boolean;
  workoutSounds: boolean;
  haptics: boolean;
  daysPerWeek: string | null;
`,
    'workoutSounds: boolean;');
  replaceOnce(path,
`  large_text_mode: boolean;
  days_per_week: string | null;
`,
`  large_text_mode: boolean;
  workout_sounds?: boolean;
  haptics?: boolean;
  days_per_week: string | null;
`,
    'workout_sounds?: boolean;');
  replaceOnce(path,
`  largeTextMode: false,
  daysPerWeek: null,
`,
`  largeTextMode: false,
  workoutSounds: true,
  haptics: true,
  daysPerWeek: null,
`,
    'workoutSounds: true,');
  replaceOnce(path,
`    largeTextMode: bool(value.largeTextMode),
    trackBodyWeight: bool(value.trackBodyWeight),
`,
`    largeTextMode: bool(value.largeTextMode),
    workoutSounds: bool(value.workoutSounds, true),
    haptics: bool(value.haptics, true),
    trackBodyWeight: bool(value.trackBodyWeight),
`,
    'workoutSounds: bool(value.workoutSounds, true),');
  replaceOnce(path,
`      largeTextMode: row.large_text_mode,
      daysPerWeek: row.days_per_week,
`,
`      largeTextMode: row.large_text_mode,
      workoutSounds: bool(row.workout_sounds, true),
      haptics: bool(row.haptics, true),
      daysPerWeek: row.days_per_week,
`,
    'workoutSounds: bool(row.workout_sounds, true),');
  replaceOnce(path,
`    large_text_mode: settings.largeTextMode,
    days_per_week: stringOrNull(settings.daysPerWeek),
`,
`    large_text_mode: settings.largeTextMode,
    workout_sounds: settings.workoutSounds,
    haptics: settings.haptics,
    days_per_week: stringOrNull(settings.daysPerWeek),
`,
    'workout_sounds: settings.workoutSounds,');
}

function patchPreferencesUi() {
  const path = "app/(private)/settings/preferences/page.tsx";
  replaceOnce(path,
`  Ruler,
  Zap
`,
`  Ruler,
  Volume2,
  Vibrate,
  Zap
`,
    'Volume2,\n  Vibrate,');
  const anchor = `      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">{t("settings.language")}</CardTitle>`;
  const block = `      <Card className="border-border/70" data-workout-feedback-preferences>
        <CardHeader>
          <CardTitle className="text-base">Workout feedback</CardTitle>
          <CardDescription>Control optional sound and supported-device haptics during workout execution.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <SettingsToggleRow
            icon={Volume2}
            label="Workout sounds"
            description="Play short, restrained feedback sounds when sets and workouts complete."
            checked={settings.workoutSounds}
            disabled={controlsDisabled}
            onCheckedChange={(checked) => void updatePreference("workoutSounds", checked, "Workout sounds")}
            {...rowStatus("workoutSounds")}
          />
          <SettingsToggleRow
            icon={Vibrate}
            label="Haptics"
            description="Request subtle haptic feedback on supported devices. Unsupported browsers safely do nothing."
            checked={settings.haptics}
            disabled={controlsDisabled}
            onCheckedChange={(checked) => void updatePreference("haptics", checked, "Haptics")}
            {...rowStatus("haptics")}
          />
        </CardContent>
      </Card>

`;
  replaceOnce(path, anchor, block + anchor, 'data-workout-feedback-preferences');
}

function patchExerciseDetailReturn() {
  const path = "app/(private)/workouts/[id]/page.tsx";
  replaceOnce(path,
    'import { useParams } from "next/navigation";',
    'import { useParams, useSearchParams } from "next/navigation";',
    'useParams, useSearchParams');
  replaceOnce(path,
    'import { addToPlanActivityPayload } from "@/lib/exercise-detail/model";',
    'import { addToPlanActivityPayload } from "@/lib/exercise-detail/model";\nimport { validatedActiveWorkoutReturnTo } from "@/lib/workouts/active-workout-detail-navigation";',
    'validatedActiveWorkoutReturnTo');
  replaceOnce(path,
`  const params = useParams<{ id: string }>();
  const { user } = useAuth();
`,
`  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const returnTo = validatedActiveWorkoutReturnTo(searchParams.get("returnTo"));
  const backHref = returnTo ?? "/workouts";
  const { user } = useAuth();
`,
    'const returnTo = validatedActiveWorkoutReturnTo');
  replaceAll(path, '<Link href="/workouts">{ed("back")}</Link>', '<Link href={backHref}>{ed("back")}</Link>');
  replaceAll(path, '<Link href="/workouts"><ArrowLeft', '<Link href={backHref}><ArrowLeft');
}

patchIndexedDb();
patchSetValidation();
patchShellSetPath();
patchMinimizeVisual();
patchSettingsModel();
patchPreferencesUi();
patchExerciseDetailReturn();

console.log("Active Workout deterministic integration patches applied.");
