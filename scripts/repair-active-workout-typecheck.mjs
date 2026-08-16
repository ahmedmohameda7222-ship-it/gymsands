import fs from "node:fs";

function patch(path, before, after) {
  const source = fs.readFileSync(path, "utf8");
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error(`Missing repair anchor in ${path}: ${before.slice(0, 120)}`);
  fs.writeFileSync(path, source.replace(before, after));
}

patch(
  "lib/i18n/types.ts",
  '  | "settings.largeTextModeDesc"\n',
  '  | "settings.largeTextModeDesc"\n  | "settings.workoutFeedback"\n  | "settings.workoutFeedbackDescription"\n  | "settings.workoutSounds"\n  | "settings.workoutSoundsDescription"\n  | "settings.haptics"\n  | "settings.hapticsDescription"\n'
);

const translationInsertions = {
  en: [
    '    "settings.largeTextModeDesc": "Increases the global text scale slightly.",',
    '    "settings.largeTextModeDesc": "Increases the global text scale slightly.",\n    "settings.workoutFeedback": "Workout feedback",\n    "settings.workoutFeedbackDescription": "Control optional sound and supported-device haptics during workout execution.",\n    "settings.workoutSounds": "Workout sounds",\n    "settings.workoutSoundsDescription": "Play short, restrained feedback sounds when sets and workouts complete.",\n    "settings.haptics": "Haptics",\n    "settings.hapticsDescription": "Use subtle haptic feedback on supported devices. Unsupported browsers safely do nothing.",'
  ],
  de: [
    '    "settings.largeTextModeDesc": "Vergrößert die globale Textdarstellung leicht.",',
    '    "settings.largeTextModeDesc": "Vergrößert die globale Textdarstellung leicht.",\n    "settings.workoutFeedback": "Workout-Feedback",\n    "settings.workoutFeedbackDescription": "Steuere optionale Sounds und Haptik auf unterstützten Geräten während des Workouts.",\n    "settings.workoutSounds": "Workout-Sounds",\n    "settings.workoutSoundsDescription": "Spiele kurze, dezente Sounds ab, wenn Sätze und Workouts abgeschlossen werden.",\n    "settings.haptics": "Haptik",\n    "settings.hapticsDescription": "Nutze dezentes haptisches Feedback auf unterstützten Geräten. Nicht unterstützte Browser tun nichts.",'
  ],
  ar: [
    '    "settings.largeTextModeDesc": "يزيد حجم النص العام قليلًا.",',
    '    "settings.largeTextModeDesc": "يزيد حجم النص العام قليلًا.",\n    "settings.workoutFeedback": "ملاحظات التمرين",\n    "settings.workoutFeedbackDescription": "تحكم في أصوات التمرين والاهتزاز على الأجهزة المدعومة.",\n    "settings.workoutSounds": "أصوات التمرين",\n    "settings.workoutSoundsDescription": "تشغيل أصوات قصيرة وهادئة عند إكمال المجموعات والتمرين.",\n    "settings.haptics": "الاهتزاز",\n    "settings.hapticsDescription": "استخدم اهتزازًا خفيفًا على الأجهزة المدعومة. المتصفحات غير المدعومة لن تفعل شيئًا.",'
  ]
};
let translations = fs.readFileSync("lib/i18n/translations.ts", "utf8");
for (const [, [before, after]] of Object.entries(translationInsertions)) {
  if (!translations.includes('"settings.workoutFeedback"') || translations.split('"settings.workoutFeedback"').length - 1 < 3) {
    if (!translations.includes(before)) throw new Error(`Missing translation repair anchor: ${before}`);
    translations = translations.replace(before, after);
  }
}
fs.writeFileSync("lib/i18n/translations.ts", translations);

patch(
  "app/(private)/settings/preferences/page.tsx",
  '  Ruler,\n  Volume2,\n  Vibrate,\n  Zap\n',
  '  Ruler,\n  Zap\n'
);
patch(
  "app/(private)/settings/preferences/page.tsx",
`          <SettingsToggleRow
            icon={Volume2}
            label={t("settings.workoutSounds")}
            description={t("settings.workoutSoundsDescription")}
            checked={settings.workoutSounds}
            disabled={controlsDisabled}
            onCheckedChange={(checked) => void updatePreference("workoutSounds", checked, t("settings.workoutSounds"))}
            {...rowStatus("workoutSounds")}
          />
          <SettingsToggleRow
            icon={Vibrate}
            label={t("settings.haptics")}
            description={t("settings.hapticsDescription")}
            checked={settings.haptics}
            disabled={controlsDisabled}
            onCheckedChange={(checked) => void updatePreference("haptics", checked, t("settings.haptics"))}
            {...rowStatus("haptics")}
          />`,
`          <SettingsToggleRow
            label={t("settings.workoutSounds")}
            description={t("settings.workoutSoundsDescription")}
            defaultOn={settings.workoutSounds}
            disabled={controlsDisabled}
            onChange={(checked) => void updatePreference("workoutSounds", checked, t("settings.workoutSounds"))}
            status={rowStatus("workoutSounds").status}
            statusText={rowStatus("workoutSounds").statusText}
          />
          <SettingsToggleRow
            label={t("settings.haptics")}
            description={t("settings.hapticsDescription")}
            defaultOn={settings.haptics}
            disabled={controlsDisabled}
            onChange={(checked) => void updatePreference("haptics", checked, t("settings.haptics"))}
            status={rowStatus("haptics").status}
            statusText={rowStatus("haptics").statusText}
          />`
);

const corePath = "components/workouts/active-workout/active-workout-core-session-implementation.tsx";
let core = fs.readFileSync(corePath, "utf8");
const persistBlock = `  const persistSetDrafts = useCallback(async (states = exerciseStatesRef.current) => {
    if (!userId || !sessionId || !states.length) return;
    await writeActiveWorkoutSetDrafts({
      userId,
      workoutSessionId: sessionId,
      drafts: states.flatMap((exercise) => exercise.sets
        .filter((set) => !set.completedAt)
        .map((set) => ({
          snapshotItemId: exercise.prescriptionItem.id,
          setNumber: set.setNumber,
          draft: { reps: set.reps, weightKg: set.weightKg, rpe: set.rpe, rir: set.rir, setType: set.setType, notes: set.notes }
        })))
    });
  }, [sessionId, userId]);

`;
if (core.includes(persistBlock)) {
  core = core.replace(persistBlock, "");
  const insertionAnchor = `  const flushPendingSetWrites = useCallback(
    () => autosaveCoordinatorRef.current?.requestFlush() ?? Promise.resolve(),
    []
  );

`;
  if (!core.includes(insertionAnchor)) throw new Error("Missing persistSetDrafts insertion anchor");
  core = core.replace(insertionAnchor, insertionAnchor + persistBlock);
}
core = core.replace(
  'activeProgressionTarget.next_target_reps === null ? null : `${formatters.integer(activeProgressionTarget.next_target_reps)} ${tr("units.reps")}`',
  'activeProgressionTarget.next_target_reps === null ? null : `${activeProgressionTarget.next_target_reps} ${tr("units.reps")}`'
);
fs.writeFileSync(corePath, core);

patch(
  "components/workouts/active-workout/active-workout-replacement-recommendations.tsx",
`const SUPPORTED_REASONS: ExerciseAlternativeReason[] = [
  "machine_taken",
  "no_equipment",
  "pain_or_discomfort",
  "too_hard",
  "other",
];`,
`const SUPPORTED_REASONS = [
  "machine_taken",
  "no_equipment",
  "pain_or_discomfort",
  "too_hard",
  "other",
] as const satisfies readonly ExerciseAlternativeReason[];`
);

patch(
  "lib/auth/private-route-gate.test.ts",
  '      largeTextMode: false,\n      daysPerWeek: null,\n',
  '      largeTextMode: false,\n      workoutSounds: true,\n      haptics: true,\n      daysPerWeek: null,\n'
);

console.log("Applied bounded Active Workout typecheck repairs.");
