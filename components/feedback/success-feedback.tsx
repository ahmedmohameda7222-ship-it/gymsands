"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";

type SuccessFeedbackValue = { celebrate: (message?: string) => void };
const SuccessFeedbackContext = createContext<SuccessFeedbackValue | null>(null);

function playSuccessSound() {
  const AudioContextClass = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.075, context.currentTime + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.32);
  gain.connect(context.destination);
  [659.25, 783.99].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    oscillator.connect(gain);
    oscillator.start(context.currentTime + index * 0.075);
    oscillator.stop(context.currentTime + 0.25 + index * 0.075);
  });
  window.setTimeout(() => void context.close(), 500);
}

export function SuccessFeedbackProvider({ children }: { children: React.ReactNode }) {
  const reduceMotion = useReducedMotion();
  const [message, setMessage] = useState<string | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const celebrate = useCallback((nextMessage = "Nice work") => {
    playSuccessSound();
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    setMessage(nextMessage);
    timeoutRef.current = window.setTimeout(() => setMessage(null), reduceMotion ? 900 : 1350);
  }, [reduceMotion]);

  return (
    <SuccessFeedbackContext.Provider value={{ celebrate }}>
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
            <motion.span animate={reduceMotion ? undefined : { rotate: [0, -8, 8, 0], scale: [1, 1.18, 1] }} className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="h-4 w-4" /></motion.span>
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
