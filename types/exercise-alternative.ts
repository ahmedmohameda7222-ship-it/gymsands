export const EXERCISE_ALTERNATIVE_REASONS = [
  "machine_taken",
  "no_equipment",
  "too_hard",
  "want_harder",
  "pain_discomfort",
  "no_spotter",
  "technique_confidence",
  "variation",
] as const;

/** Canonical V2 replacement intent. These values are persisted exactly for new writes. */
export type ExerciseAlternativeReasonV2 = (typeof EXERCISE_ALTERNATIVE_REASONS)[number];
