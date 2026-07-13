
const internalSourcePatterns = [
  /^\s*source\s*:\s*plaivra_legacy_workouts\s*$/i,
  /^\s*source\s*=\s*plaivra_legacy_workouts\s*$/i,
  /^\s*\[\s*source\s*:\s*plaivra_legacy_workouts\s*\]\s*$/i,
  /^\s*internal\s+source\s*:\s*plaivra_legacy_workouts\s*$/i
];

export function isInternalExerciseNoteLine(line: string) {
  return internalSourcePatterns.some((pattern) => pattern.test(line));
}

function noteLines(note: string | null | undefined) {
  return String(note ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function userFacingExerciseNote(note: string | null | undefined) {
  return noteLines(note).filter((line) => !isInternalExerciseNoteLine(line)).join("\n");
}

export function mergeUserFacingExerciseNote(original: string | null | undefined, nextUserText: string) {
  const hiddenLines = noteLines(original).filter(isInternalExerciseNoteLine);
  const visibleLines = noteLines(nextUserText).filter((line) => !isInternalExerciseNoteLine(line));
  return [...hiddenLines, ...visibleLines].join("\n") || null;
}
