import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function write(path, value) {
  fs.writeFileSync(path, value);
}

function replaceOnce(path, before, after) {
  const source = read(path);
  if (!source.includes(before)) throw new Error(`Missing repair anchor in ${path}: ${before.slice(0, 100)}`);
  write(path, source.replace(before, after));
}

function insertAfter(path, anchor, addition) {
  const source = read(path);
  if (source.includes(addition.trim())) return;
  const index = source.indexOf(anchor);
  if (index < 0) throw new Error(`Missing insertion anchor in ${path}: ${anchor}`);
  const end = index + anchor.length;
  write(path, `${source.slice(0, end)}${addition}${source.slice(end)}`);
}

// Typed Settings translations remain in the canonical useTranslation authority.
insertAfter(
  "lib/i18n/types.ts",
  '  | "settings.largeTextModeDesc"\n',
  '  | "settings.workoutFeedback"\n  | "settings.workoutFeedbackDescription"\n  | "settings.workoutSounds"\n  | "settings.workoutSoundsDescription"\n  | "settings.haptics"\n  | "settings.hapticsDescription"\n',
);

{
  const path = "lib/i18n/translations.ts";
  let source = read(path);
  if (!source.includes('"settings.workoutFeedback"')) {
    let occurrence = 0;
    const blocks = [
      '    "settings.workoutFeedback": "Workout feedback",\n    "settings.workoutFeedbackDescription": "Control sound and haptic feedback during workouts.",\n    "settings.workoutSounds": "Workout sounds",\n    "settings.workoutSoundsDescription": "Play subtle feedback sounds when completing sets and workouts.",\n    "settings.haptics": "Haptics",\n    "settings.hapticsDescription": "Use vibration feedback on supported devices.",\n',
      '    "settings.workoutFeedback": "Trainingsfeedback",\n    "settings.workoutFeedbackDescription": "Steuere Ton- und haptisches Feedback während des Trainings.",\n    "settings.workoutSounds": "Trainingstöne",\n    "settings.workoutSoundsDescription": "Spiele dezente Feedbacktöne beim Abschluss von Sätzen und Trainings.",\n    "settings.haptics": "Haptik",\n    "settings.hapticsDescription": "Nutze Vibrationsfeedback auf unterstützten Geräten.",\n',
      '    "settings.workoutFeedback": "ملاحظات التمرين",\n    "settings.workoutFeedbackDescription": "تحكم في الصوت والاهتزاز أثناء التمرين.",\n    "settings.workoutSounds": "أصوات التمرين",\n    "settings.workoutSoundsDescription": "شغّل أصواتًا خفيفة عند إكمال المجموعات والتمارين.",\n    "settings.haptics": "الاهتزاز",\n    "settings.hapticsDescription": "استخدم الاهتزاز على الأجهزة المدعومة.",\n',
    ];
    source = source.replace(/(    "settings\.largeTextModeDesc": [^\n]+,\n)/g, (match) => {
      const block = blocks[occurrence];
      if (!block) throw new Error("Unexpected extra settings.largeTextModeDesc translation occurrence.");
      occurrence += 1;
      return `${match}${block}`;
    });
    if (occurrence !== 3) throw new Error(`Expected 3 settings translation sections, found ${occurrence}.`);
    write(path, source);
  }
}

// Preferences route uses the established SettingsToggleRow contract.
replaceOnce(
  "app/(private)/settings/preferences/page.tsx",
  '  Ruler,\n  Volume2,\n  Vibrate,\n  Zap\n',
  '  Ruler,\n  Zap\n',
);
replaceOnce(
  "app/(private)/settings/preferences/page.tsx",
  '          <SettingsToggleRow\n            icon={Volume2}\n            label={t("settings.workoutSounds")}\n            description={t("settings.workoutSoundsDescription")}\n            checked={settings.workoutSounds}\n            disabled={controlsDisabled}\n            onCheckedChange={(checked) => void updatePreference("workoutSounds", checked, t("settings.workoutSounds"))}\n            {...rowStatus("workoutSounds")}\n          />',
  '          <SettingsToggleRow\n            label={t("settings.workoutSounds")}\n            description={t("settings.workoutSoundsDescription")}\n            defaultOn={settings.workoutSounds}\n            disabled={controlsDisabled}\n            onChange={(checked: boolean) => void updatePreference("workoutSounds", checked, t("settings.workoutSounds"))}\n            {...rowStatus("workoutSounds")}\n          />',
);
replaceOnce(
  "app/(private)/settings/preferences/page.tsx",
  '          <SettingsToggleRow\n            icon={Vibrate}\n            label={t("settings.haptics")}\n            description={t("settings.hapticsDescription")}\n            checked={settings.haptics}\n            disabled={controlsDisabled}\n            onCheckedChange={(checked) => void updatePreference("haptics", checked, t("settings.haptics"))}\n            {...rowStatus("haptics")}\n          />',
  '          <SettingsToggleRow\n            label={t("settings.haptics")}\n            description={t("settings.hapticsDescription")}\n            defaultOn={settings.haptics}\n            disabled={controlsDisabled}\n            onChange={(checked: boolean) => void updatePreference("haptics", checked, t("settings.haptics"))}\n            {...rowStatus("haptics")}\n          />',
);

// Draft persistence must be declared before the generalized safe-navigation callback captures it.
{
  const path = "components/workouts/active-workout/active-workout-core-session-implementation.tsx";
  let source = read(path);
  const draftStartMarker = '  const persistSetDrafts = useCallback(async (states = exerciseStatesRef.current) => {';
  const draftStart = source.indexOf(draftStartMarker);
  if (draftStart < 0) throw new Error("persistSetDrafts block not found.");
  const draftEndMarker = '  }, [sessionId, userId]);\n\n';
  const draftEndStart = source.indexOf(draftEndMarker, draftStart);
  if (draftEndStart < 0) throw new Error("persistSetDrafts block terminator not found.");
  const draftEnd = draftEndStart + draftEndMarker.length;
  const draftBlock = source.slice(draftStart, draftEnd);
  source = `${source.slice(0, draftStart)}${source.slice(draftEnd)}`;
  const safeNavigationAnchor = '  const preserveWorkoutForNavigation = useCallback(async () => {';
  const safeNavigationIndex = source.indexOf(safeNavigationAnchor);
  if (safeNavigationIndex < 0) throw new Error("safe navigation callback not found.");
  source = `${source.slice(0, safeNavigationIndex)}${draftBlock}${source.slice(safeNavigationIndex)}`;
  source = source.replace(
    'formatters.integer(activeProgressionTarget.next_target_reps)',
    'formatters.integer(Number(activeProgressionTarget.next_target_reps))',
  );
  write(path, source);
}

// Replacement reason buttons intentionally expose the five in-workout reason choices only.
replaceOnce(
  "components/workouts/active-workout/active-workout-replacement-recommendations.tsx",
  'const SUPPORTED_REASONS: ExerciseAlternativeReason[] = [\n  "machine_taken",\n  "no_equipment",\n  "pain_or_discomfort",\n  "too_hard",\n  "other",\n];\n\nconst reasonTranslationKey: Record<(typeof SUPPORTED_REASONS)[number], string> = {',
  'type SupportedReplacementReason =\n  | "machine_taken"\n  | "no_equipment"\n  | "pain_or_discomfort"\n  | "too_hard"\n  | "other";\n\nconst SUPPORTED_REASONS: readonly SupportedReplacementReason[] = [\n  "machine_taken",\n  "no_equipment",\n  "pain_or_discomfort",\n  "too_hard",\n  "other",\n];\n\nconst reasonTranslationKey: Record<SupportedReplacementReason, string> = {',
);

// Candidate browsing stays on the canonical Exercise Library service but only needs the workout rows.
replaceOnce(
  "services/workouts/active-workout/replacement-recommendations-client.ts",
  '  getWorkoutAlternatives,\n  getWorkoutsWithStatus,\n',
  '  getWorkoutAlternatives,\n  getWorkouts,\n',
);
replaceOnce(
  "services/workouts/active-workout/replacement-recommendations-client.ts",
  '    getWorkoutsWithStatus("", filtersFor(original), 0, input.locale, requestContext).catch((error) => {',
  '    getWorkouts("", filtersFor(original), 0, input.locale, requestContext).catch((error) => {',
);
replaceOnce(
  "services/workouts/active-workout/replacement-recommendations-client.ts",
  '  const catalog = catalogResult?.data ?? [];',
  '  const catalog = catalogResult ?? [];',
);

// Existing typed fixtures receive the two new durable preference defaults.
insertAfter(
  "lib/auth/private-route-gate.test.ts",
  '      largeTextMode: false,\n',
  '      workoutSounds: true,\n      haptics: true,\n',
);

// The new additive settings migration is repository-only until Planner approval.
{
  const path = "supabase/migration-ledger.json";
  const ledger = JSON.parse(read(path));
  const migration = "20260816044500_active_workout_feedback_preferences.sql";
  if (!ledger.entries.some((entry) => entry.localFile === migration)) {
    ledger.entries.push({
      localFile: migration,
      state: "pending",
      note: "Active Workout feedback-preference repository-only additive migration; not applied to Plaivra Production and has no Production identity. Do not replay or apply before explicit Planner approval.",
    });
    ledger.entries.sort((left, right) => left.localFile.localeCompare(right.localFile));
  }
  const unresolved = ledger.entries.filter((entry) => !["applied", "applied_version_alias"].includes(entry.state));
  const pending = ledger.entries.filter((entry) => entry.state === "pending");
  const schemaUntracked = ledger.entries.filter((entry) => entry.state === "applied_schema_untracked");
  ledger.pendingCount = pending.length;
  ledger.unresolvedCount = unresolved.length;
  ledger.schemaVerifiedUntrackedCount = schemaUntracked.length;
  ledger.historyRepair.pendingCount = pending.length;
  ledger.historyRepair.unresolvedCount = unresolved.length;
  ledger.historyRepair.schemaAppliedUntrackedCount = schemaUntracked.length;
  ledger.historyRepair.state = unresolved.length ? "pending" : "reconciled";
  ledger.historyRepair.note = "Workout History and PCS-2 Production migration history remain reconciled through 20260803173755_private_app_bootstrap_v1. Repository migration 20260804174500_fix_profiles_update_policy_recursion.sql was applied exactly once to Plaivra Production as generated version 20260804180932_fix_profiles_update_policy_recursion and is represented by an applied-version alias. Do not replay. The released compatibility marker remains 20260724232734, Activity Catalog was not modified, and durable Git evidence remains bound to the reachable Workout History squash merge dfa14c3bc2c1524ff185b1ee4e170f4537a80230. P10F repository migration 20260811234000_p10f_v2_plan_activity_catalog_authority_snapshot.sql, Exercise Detail plus Personal Records repository migration 20260813042754_exercise_detail_personal_records_authority.sql, Workout History redesign repository migration 20260813071926_workout_history_redesign_read_contract.sql, and Active Workout feedback-preference repository migration 20260816044500_active_workout_feedback_preferences.sql are intentionally pending, absent from Production, and claim no Production identity. Do not replay or apply these pending migrations before explicit Planner approval.";
  write(path, `${JSON.stringify(ledger)}\n`);
}

{
  const path = "README.md";
  let source = read(path);
  if (!source.includes("20260816044500_active_workout_feedback_preferences.sql")) {
    source = source.replace(
      '- Exercise Detail + Personal Records introduces repository migration `20260813042754_exercise_detail_personal_records_authority.sql` as a second **pending, repository-only** migration. It has not been applied to Production, has no Production identity, and must not be replayed or applied before explicit Planner approval.\n- While those two migrations are pending, the canonical ledger records `pendingCount = 2`, `unresolvedCount = 2`, and `historyRepair.state = pending`; the previously applied Production history remains reconciled and unchanged.\n',
      '- Exercise Detail + Personal Records introduces repository migration `20260813042754_exercise_detail_personal_records_authority.sql` as a **pending, repository-only** migration. It has not been applied to Production, has no Production identity, and must not be replayed or applied before explicit Planner approval.\n- Workout History redesign migration `20260813071926_workout_history_redesign_read_contract.sql` remains **pending, repository-only** and absent from Production.\n- Active Workout feedback preferences introduce repository migration `20260816044500_active_workout_feedback_preferences.sql` as a **pending, repository-only** additive settings migration. It has not been applied to Production and has no Production identity.\n- While these four migrations are pending, the canonical ledger records `pendingCount = 4`, `unresolvedCount = 4`, and `historyRepair.state = pending`; the previously applied Production history remains reconciled and unchanged.\n',
    );
    source += '\n## Active Workout feedback preferences pending migration\n\n- `20260816044500_active_workout_feedback_preferences.sql` adds durable account-scoped workout sound and haptic preferences to the existing `user_app_settings` authority.\n- It is repository-only and classified `pending`; it has **not** been applied to Plaivra Production and intentionally has no Production migration identity.\n- Existing `user_app_settings` owner RLS remains authoritative. Do not replay or apply the migration before explicit Planner approval of the Active Workout merge/release sequence.\n';
    write(path, source);
  }
}

{
  const path = "docs/architecture/migration-ledger-reconciliation.md";
  let source = read(path);
  source = source.replace(
    "**Status:** Applied Production history reconciled; two repository migrations intentionally pending",
    "**Status:** Applied Production history reconciled; four repository migrations intentionally pending",
  );
  source = source.replace("- Repository-only pending migrations: **2**\n- `pendingCount = 2`", "- Repository-only pending migrations: **4**\n- `pendingCount = 4`");
  source = source.replace("- `unresolvedCount = 2`", "- `unresolvedCount = 4`");
  source = source.replace(
    "The previously applied Plaivra Production migration history remains reconciled through `20260804180932_fix_profiles_update_policy_recursion`. P10F migration `20260811234000_p10f_v2_plan_activity_catalog_authority_snapshot.sql` and Exercise Detail + Personal Records migration `20260813042754_exercise_detail_personal_records_authority.sql` are intentionally classified `pending`. Neither has been applied to Production, neither claims a Production identity, and neither may be replayed or applied before explicit Planner approval.",
    "The previously applied Plaivra Production migration history remains reconciled through `20260804180932_fix_profiles_update_policy_recursion`. P10F migration `20260811234000_p10f_v2_plan_activity_catalog_authority_snapshot.sql`, Exercise Detail + Personal Records migration `20260813042754_exercise_detail_personal_records_authority.sql`, Workout History redesign migration `20260813071926_workout_history_redesign_read_contract.sql`, and Active Workout feedback-preference migration `20260816044500_active_workout_feedback_preferences.sql` are intentionally classified `pending`. None has been applied to Production, none claims a Production identity, and none may be replayed or applied before explicit Planner approval.",
  );
  if (!source.includes("## Active Workout feedback preferences pending migration authority")) {
    source = source.replace(
      "\n## Authority and verification\n",
      "\n## Active Workout feedback preferences pending migration authority\n\n- `20260816044500_active_workout_feedback_preferences.sql` is the additive account-scoped settings authority for workout sound and haptic preferences.\n- Ledger state: `pending`; Production version/name: intentionally absent.\n- Existing owner-scoped `user_app_settings` RLS remains authoritative; the migration was not applied to Plaivra Production.\n- Do not replay or apply it before explicit Planner approval of the Active Workout merge/release sequence.\n\n## Authority and verification\n",
    );
  }
  write(path, source);
}

console.log("Active Workout CI integration repairs applied.");
