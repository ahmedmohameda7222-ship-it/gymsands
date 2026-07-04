import { useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

export const MOTION_DURATION = {
  press: 0.08,
  hover: 0.15,
  card: 0.2,
  row: 0.22,
  page: 0.25,
  progress: 0.65,
  success: 0.3,
  stagger: 0.045
} as const;

export const MOTION_EASE = {
  default: [0.25, 0.1, 0.25, 1] as const,
  bounceOut: [0.34, 1.56, 0.64, 1] as const,
  smooth: [0.4, 0, 0.2, 1] as const
} as const;

export const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: MOTION_DURATION.page,
      delay: i * MOTION_DURATION.stagger,
      ease: MOTION_EASE.default
    }
  })
};

export const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: MOTION_DURATION.card, ease: MOTION_EASE.default } }
};

export const scaleIn = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1, transition: { duration: MOTION_DURATION.card, ease: MOTION_EASE.default } }
};

export const staggerContainer = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: MOTION_DURATION.stagger,
      delayChildren: 0.05
    }
  }
};

export const listItem = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: MOTION_DURATION.row, ease: MOTION_EASE.default } },
  exit: { opacity: 0, x: -12, transition: { duration: 0.15, ease: MOTION_EASE.default } }
};

export const checkPulse = {
  initial: { scale: 1 },
  animate: { scale: [1, 1.14, 1], transition: { duration: MOTION_DURATION.success, ease: MOTION_EASE.bounceOut } }
};

export function useCountUp(end: number, durationMs = 800, start = 0) {
  const [value, setValue] = useState(start);
  const reduceMotion = useReducedMotion();
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    if (reduceMotion) {
      setValue(end);
      return;
    }
    const range = end - start;
    if (range === 0) {
      setValue(end);
      return;
    }

    startTimeRef.current = performance.now();

    function tick(now: number) {
      const elapsed = now - startTimeRef.current;
      const progress = Math.min(elapsed / durationMs, 1);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(start + range * eased));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [end, durationMs, start, reduceMotion]);

  return value;
}

export function useAnimatedProgress(target: number, durationMs = 650) {
  const [value, setValue] = useState(0);
  const reduceMotion = useReducedMotion();
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (reduceMotion) {
      setValue(target);
      return;
    }
    const start = value;
    const range = target - start;
    if (range === 0) return;

    const startTime = performance.now();

    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(start + range * eased);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, durationMs, reduceMotion]);

  return value;
}
