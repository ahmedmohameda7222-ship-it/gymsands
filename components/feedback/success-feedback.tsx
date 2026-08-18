"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";

import { useUserSettings } from "@/lib/settings/user-settings-context";
import { createWorkoutFeedbackController } from "@/lib/workouts/workout-feedback";

type SuccessFeedbackValue = {
  celebrate: (message?: string) => void;
  setCompleted: () => void;
  workoutCompleted: (message?: string) => void;
  error: () => void;
};

const SuccessFeedbackContext = createContext<SuccessFeedbackValue | null>(null);

export function SuccessFeedbackProvider({ children }: { children: React.ReactNode }) {
  const reduceMotion = useReducedMotion();
  const { settings } = useUserSettings();
  const [message, setMessage] = useState<string | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const [feedback] = useState(() => createWorkoutFeedbackController({
    sounds: settings.workoutSounds,
    haptics: settings.haptics,
  }));

  useEffect(() => {
    feedback.updatePreferences({
      sounds: settings.workoutSounds,
      haptics: settings.haptics,
    });
  }, [feedback, settings.haptics, settings.workoutSounds]);

  useEffect(() => () => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    feedback.dispose();
  }, [feedback]);

  const setCompleted = useCallback(() => {
    feedback.setCompleted();
  }, [feedback]);

  const error = useCallback(() => {
    feedback.error();
  }, [feedback]);

  const workoutCompleted = useCallback((nextMessage = "Nice work") => {
    feedback.workoutCompleted();
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    setMessage(nextMessage);
    timeoutRef.current = window.setTimeout(() => setMessage(null), reduceMotion ? 900 : 1350);
  }, [feedback, reduceMotion]);

  const celebrate = workoutCompleted;

  return (
    <SuccessFeedbackContext.Provider value={{ celebrate, setCompleted, workoutCompleted, error }}>
      {children}
      <AnimatePresence>
        {message ? (
          <motion.div
            role="status"
            aria-live="polite"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.82, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: -8 }}
            className="pointer-events-none fixed left-1/2 top-[18%] z-[120] flex -translate-x-1/2 items-center gap-2 rounded-full border border-primary/25 bg-card/95 px-4 py-2.5 text-sm font-semibold shadow-xl backdrop-blur"
          >
            <motion.span
              animate={reduceMotion ? undefined : { rotate: [0, -8, 8, 0], scale: [1, 1.18, 1] }}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground"
            >
              <Check className="h-4 w-4" aria-hidden="true" />
            </motion.span>
            {message}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </SuccessFeedbackContext.Provider>
  );
}

export function useSuccessFeedback() {
  const value = useContext(SuccessFeedbackContext);
  if (!value) throw new Error("useSuccessFeedback must be used inside SuccessFeedbackProvider");
  return value;
}
