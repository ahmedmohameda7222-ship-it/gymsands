export const TRANSIENT_FEEDBACK_DURATION_MS = Object.freeze({
  success: 3000,
  info: 3500,
  warning: 5000,
  error: 5000,
});

export type TransientFeedbackKind = keyof typeof TRANSIENT_FEEDBACK_DURATION_MS;

export function transientFeedbackDuration(kind: TransientFeedbackKind) {
  return TRANSIENT_FEEDBACK_DURATION_MS[kind];
}
