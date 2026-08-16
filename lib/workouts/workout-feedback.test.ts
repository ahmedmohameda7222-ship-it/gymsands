import { describe, expect, it, vi } from "vitest";

import { createWorkoutFeedbackController } from "./workout-feedback";

describe("workout feedback capability", () => {
  it("requests set feedback once per semantic call", () => {
    const createAudioContext = vi.fn(() => null);
    const vibrate = vi.fn(() => true);
    const feedback = createWorkoutFeedbackController(
      { sounds: true, haptics: true },
      { createAudioContext, vibrate },
    );
    feedback.setCompleted();
    expect(createAudioContext).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenCalledTimes(1);
    feedback.dispose();
  });

  it("does not request sound when workout sounds are disabled", () => {
    const createAudioContext = vi.fn(() => null);
    const feedback = createWorkoutFeedbackController(
      { sounds: false, haptics: true },
      { createAudioContext, vibrate: () => true },
    );
    feedback.setCompleted();
    expect(createAudioContext).not.toHaveBeenCalled();
  });

  it("does not request haptic when haptics are disabled", () => {
    const vibrate = vi.fn(() => true);
    const feedback = createWorkoutFeedbackController(
      { sounds: false, haptics: false },
      { vibrate },
    );
    feedback.setCompleted();
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("is a safe no-op when a platform has no feedback capabilities", () => {
    const feedback = createWorkoutFeedbackController({ sounds: true, haptics: true }, {});
    expect(() => feedback.setCompleted()).not.toThrow();
    expect(() => feedback.workoutCompleted()).not.toThrow();
    expect(() => feedback.error()).not.toThrow();
  });

  it("uses stronger workout completion haptics only when workout completion is requested", () => {
    const vibrate = vi.fn(() => true);
    const feedback = createWorkoutFeedbackController(
      { sounds: false, haptics: true },
      { vibrate },
    );
    feedback.setCompleted();
    expect(vibrate).toHaveBeenLastCalledWith(18);
    feedback.workoutCompleted();
    expect(vibrate).toHaveBeenLastCalledWith([22, 35, 32]);
  });

  it("updates account preferences without rebuilding business logic", () => {
    const vibrate = vi.fn(() => true);
    const createAudioContext = vi.fn(() => null);
    const feedback = createWorkoutFeedbackController(
      { sounds: false, haptics: false },
      { vibrate, createAudioContext },
    );
    feedback.setCompleted();
    expect(vibrate).not.toHaveBeenCalled();
    expect(createAudioContext).not.toHaveBeenCalled();
    feedback.updatePreferences({ sounds: true, haptics: true });
    feedback.setCompleted();
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(createAudioContext).toHaveBeenCalledTimes(1);
  });
});
