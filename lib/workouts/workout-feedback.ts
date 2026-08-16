export type WorkoutFeedbackPreferences = {
  sounds: boolean;
  haptics: boolean;
};

export type WorkoutFeedbackCapabilities = {
  createAudioContext?: () => AudioContext | null;
  vibrate?: (pattern: number | number[]) => boolean;
};

export type WorkoutFeedbackController = {
  setCompleted: () => void;
  workoutCompleted: () => void;
  error: () => void;
  updatePreferences: (preferences: WorkoutFeedbackPreferences) => void;
  dispose: () => void;
};

type FeedbackKind = "set" | "workout" | "error";

const HAPTIC_PATTERNS: Readonly<Record<FeedbackKind, number | number[]>> = Object.freeze({
  set: 18,
  workout: [22, 35, 32],
  error: [28, 45, 28],
});

function browserCapabilities(): WorkoutFeedbackCapabilities {
  if (typeof window === "undefined") return {};
  return {
    createAudioContext: () => {
      const AudioContextClass = window.AudioContext
        ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      return AudioContextClass ? new AudioContextClass() : null;
    },
    vibrate: typeof navigator.vibrate === "function"
      ? (pattern) => navigator.vibrate(pattern)
      : undefined,
  };
}

function tone(context: AudioContext, kind: FeedbackKind) {
  const now = context.currentTime;
  const gain = context.createGain();
  const config = kind === "workout"
    ? { frequencies: [523.25, 659.25, 783.99], peak: 0.065, duration: 0.34, spacing: 0.07 }
    : kind === "error"
      ? { frequencies: [196], peak: 0.04, duration: 0.16, spacing: 0 }
      : { frequencies: [659.25], peak: 0.045, duration: 0.14, spacing: 0 };
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(config.peak, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + config.duration);
  gain.connect(context.destination);
  config.frequencies.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    oscillator.connect(gain);
    oscillator.start(now + index * config.spacing);
    oscillator.stop(now + config.duration + index * config.spacing);
  });
}

export function createWorkoutFeedbackController(
  initialPreferences: WorkoutFeedbackPreferences,
  injectedCapabilities?: WorkoutFeedbackCapabilities,
): WorkoutFeedbackController {
  let preferences = { ...initialPreferences };
  const capabilities = injectedCapabilities ?? browserCapabilities();
  let audioContext: AudioContext | null = null;
  let disposed = false;

  function request(kind: FeedbackKind) {
    if (disposed) return;
    if (preferences.sounds && capabilities.createAudioContext) {
      try {
        audioContext ??= capabilities.createAudioContext();
        if (audioContext) {
          if (audioContext.state === "suspended") void audioContext.resume().catch(() => undefined);
          tone(audioContext, kind);
        }
      } catch {
        // Feedback is an enhancement and must never block workout execution.
      }
    }
    if (preferences.haptics && capabilities.vibrate) {
      try {
        capabilities.vibrate(HAPTIC_PATTERNS[kind]);
      } catch {
        // Unsupported or denied vibration is intentionally a no-op.
      }
    }
  }

  return {
    setCompleted: () => request("set"),
    workoutCompleted: () => request("workout"),
    error: () => request("error"),
    updatePreferences(next) {
      preferences = { ...next };
    },
    dispose() {
      disposed = true;
      const context = audioContext;
      audioContext = null;
      if (context && context.state !== "closed") void context.close().catch(() => undefined);
    },
  };
}
