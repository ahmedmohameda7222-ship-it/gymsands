import fs from "node:fs";

const detailsPath = "components/workouts/active-workout/active-workout-details-bridge.tsx";
const corePath = "components/workouts/active-workout/active-workout-core-session-implementation.tsx";
let details = fs.readFileSync(detailsPath, "utf8");
let core = fs.readFileSync(corePath, "utf8");

function replaceOnce(source, before, after, marker = after) {
  if (source.includes(marker)) return source;
  if (!source.includes(before)) throw new Error(`Replacement UI patch anchor not found: ${before.slice(0, 140)}`);
  return source.replace(before, after);
}

function replaceSection(source, startMarker, endMarker, after, marker) {
  if (source.includes(marker)) return source;
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`Replacement UI section start not found: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  if (end < 0) throw new Error(`Replacement UI section end not found: ${endMarker}`);
  return source.slice(0, start) + after + source.slice(end);
}

details = replaceOnce(
  details,
  'import { useEffect, useRef, type RefObject } from "react";',
  'import { useEffect, useMemo, useRef, type RefObject } from "react";',
  'useEffect, useMemo, useRef'
);
details = replaceOnce(
  details,
  'import { ActiveWorkoutMuscleLoadSection } from "@/components/workouts/active-workout/active-workout-muscle-load-section";\n',
  'import { ActiveWorkoutMuscleLoadSection } from "@/components/workouts/active-workout/active-workout-muscle-load-section";\nimport { ActiveWorkoutReplacementRecommendations } from "@/components/workouts/active-workout/active-workout-replacement-recommendations";\n',
  'ActiveWorkoutReplacementRecommendations'
);
details = replaceOnce(
  details,
  '  isolateBidiText,\n  type ActiveWorkoutFormatters,\n',
  '  type ActiveWorkoutFormatters,\n',
  '  type ActiveWorkoutFormatters,'
);
details = replaceOnce(
  details,
  '  sourceKind: "plan-day" | "direct";\n',
  '  sourceKind: "plan-day" | "direct";\n  userId: string | null;\n  locale: string;\n  sessionExerciseIds: ReadonlySet<string>;\n',
  'sessionExerciseIds: ReadonlySet<string>;'
);
details = replaceOnce(
  details,
  '  onAddReplacement: (replacement: Workout) => void;\n',
  '  onAddReplacement: (replacement: Workout) => Promise<boolean>;\n',
  'Promise<boolean>;'
);
details = replaceOnce(
  details,
  '  sourceKind,\n  activeExercise,\n',
  '  sourceKind,\n  userId,\n  locale,\n  sessionExerciseIds,\n  activeExercise,\n',
  '  sessionExerciseIds,\n  activeExercise,'
);
details = replaceOnce(
  details,
  '  const rirErrorId = activeRirValidation.error ? "active-set-rir-error" : undefined;\n',
  '  const rirErrorId = activeRirValidation.error ? "active-set-rir-error" : undefined;\n  const replacementOriginal = useMemo(() => ({\n    id: activeExercise.exercise.source_workout_id ?? activeExercise.exercise.workout_id ?? activeExercise.prescriptionItem.sourcePlanActivityId ?? "",\n    name: activeExercise.exercise.exercise_name,\n    targetMuscle: activeExercise.exercise.target_muscle,\n    equipment: activeExercise.exercise.equipment,\n    difficulty: null,\n    mechanics: null,\n    forceType: null,\n    movementPattern: null,\n    secondaryMuscles: [] as string[]\n  }), [\n    activeExercise.exercise.equipment,\n    activeExercise.exercise.exercise_name,\n    activeExercise.exercise.source_workout_id,\n    activeExercise.exercise.target_muscle,\n    activeExercise.exercise.workout_id,\n    activeExercise.prescriptionItem.sourcePlanActivityId\n  ]);\n',
  'const replacementOriginal = useMemo'
);

const adjustStart = '                  <p className="mt-2 text-sm text-muted-foreground">\n                    {tr("actions.replaceTodayDescription")}\n                  </p>\n';
const adjustEnd = '                  <AiActionRequestDialog\n';
const replacementBlock = '                  <p className="mt-2 text-sm text-muted-foreground">\n                    {tr("actions.replaceTodayDescription")}\n                  </p>\n                  <ActiveWorkoutReplacementRecommendations\n                    userId={userId ?? ""}\n                    original={replacementOriginal}\n                    reason={replacementReason}\n                    onReasonChange={onReplacementReasonChange}\n                    locale={locale}\n                    savedAlternatives={activeAlternatives}\n                    sessionExerciseIds={sessionExerciseIds}\n                    busy={busy || isSavingAlternative}\n                    onReplace={(replacement) => {\n                      void onAddReplacement(replacement).then((saved) => {\n                        if (saved) onOpenChange(false);\n                      });\n                    }}\n                    onBrowseAll={() => {\n                      onOpenChange(false);\n                      onUseReplacement();\n                    }}\n                    tr={tr}\n                  />\n                  <Button\n                    type="button"\n                    variant="outline"\n                    className="mt-3 min-h-11 border-amber-500/40 text-foreground hover:bg-amber-500/10"\n                    onClick={() => {\n                      onOpenChange(false);\n                      onSkipExercise();\n                    }}\n                    disabled={busy}\n                  >\n                    {tr("actions.skipExerciseToday")}\n                  </Button>\n';
details = replaceSection(details, adjustStart, adjustEnd, replacementBlock, '<ActiveWorkoutReplacementRecommendations');

core = replaceOnce(
  core,
  '  async function applyStableReplacement(replacement: Workout) {\n',
  '  async function applyStableReplacement(replacement: Workout): Promise<boolean> {\n',
  'Promise<boolean>'
);
core = replaceOnce(
  core,
  '    if (sourceKind !== "plan-day" || !userId || !sessionId || !activeExercise) return;\n',
  '    if (sourceKind !== "plan-day" || !userId || !sessionId || !activeExercise) return false;\n',
  'return false;'
);
core = replaceOnce(
  core,
  '    if (!store) return;\n    const originalName = activeExercise.exercise.exercise_name;\n',
  '    if (!store) return false;\n    const originalName = activeExercise.exercise.exercise_name;\n',
  'if (!store) return false;'
);
core = replaceOnce(
  core,
  '      void createExerciseAlternative(userId, {\n',
  '      void createExerciseAlternative(userId, {\n',
  'void createExerciseAlternative(userId, {'
);
core = replaceOnce(
  core,
  '      }).catch((error) => {\n        console.warn("Plaivra recorded the workout replacement but could not save the optional alternative shortcut.", error);\n      });\n    } catch (error) {\n',
  '      }).catch((error) => {\n        console.warn("Plaivra recorded the workout replacement but could not save the optional alternative shortcut.", error);\n      });\n      return true;\n    } catch (error) {\n',
  '      return true;\n    } catch (error) {'
);
core = replaceOnce(
  core,
  '    } catch (error) {\n      toastRef.current({ title: tr("exercise.replacementFailed"), description: userSafeError(error) });\n    } finally {\n',
  '    } catch (error) {\n      setSetFeedbackVariant("error");\n      setSetFeedback(tr("replacement.unavailable"));\n      toastRef.current({ title: tr("exercise.replacementFailed"), description: userSafeError(error) });\n      return false;\n    } finally {\n',
  'setSetFeedback(tr("replacement.unavailable"));'
);
core = replaceOnce(
  core,
  '            sourceKind={sourceKind}\n            activeExercise={activeExercise}\n',
  '            sourceKind={sourceKind}\n            userId={userId}\n            locale={language}\n            sessionExerciseIds={new Set(exerciseStates.map((item) => item.exercise.source_workout_id ?? item.exercise.workout_id).filter((value): value is string => Boolean(value)))}\n            activeExercise={activeExercise}\n',
  'sessionExerciseIds={new Set(exerciseStates.map'
);
core = replaceOnce(
  core,
  '            onAddReplacement={(replacement) => { void applyStableReplacement(replacement); }}\n',
  '            onAddReplacement={applyStableReplacement}\n',
  'onAddReplacement={applyStableReplacement}'
);

fs.writeFileSync(detailsPath, details);
fs.writeFileSync(corePath, core);
console.log("Active Workout intelligent replacement UI integration applied.");
