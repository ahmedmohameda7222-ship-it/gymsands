"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { MOTION_DURATION, MOTION_EASE } from "@/lib/motion";

export function AnimatedNumber({
  value,
  durationMs = 800,
  prefix = "",
  suffix = "",
  className = ""
}: {
  value: number;
  durationMs?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const [display, setDisplay] = useState(value);
  const reduceMotion = useReducedMotion();
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);
  const fromRef = useRef<number>(value);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    const range = to - from;

    if (reduceMotion || range === 0) {
      setDisplay(to);
      fromRef.current = to;
      return;
    }

    startRef.current = performance.now();

    function tick(now: number) {
      const elapsed = now - startRef.current;
      const progress = Math.min(elapsed / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + range * eased));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, durationMs, reduceMotion]);

  return (
    <span className={className} aria-label={`${prefix}${value}${suffix}`}>
      {prefix}{display.toLocaleString()}{suffix}
    </span>
  );
}

export function AnimatedProgress({
  value,
  className = "",
  indicatorClassName = "",
  indicatorStyle,
  durationMs = 650
}: {
  value: number;
  className?: string;
  indicatorClassName?: string;
  indicatorStyle?: React.CSSProperties;
  durationMs?: number;
}) {
  const safeValue = Math.min(100, Math.max(0, value));
  const reduceMotion = useReducedMotion();
  const [displayWidth, setDisplayWidth] = useState(reduceMotion ? safeValue : 0);
  const rafRef = useRef<number>(0);
  const fromRef = useRef(0);

  useEffect(() => {
    if (reduceMotion) {
      setDisplayWidth(safeValue);
      fromRef.current = safeValue;
      return;
    }
    const from = fromRef.current;
    const range = safeValue - from;
    if (range === 0) return;

    const start = performance.now();

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayWidth(from + range * eased);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = safeValue;
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [safeValue, durationMs, reduceMotion]);

  return (
    <div className={`h-2.5 w-full overflow-hidden rounded-full bg-muted ${className}`}>
      <div
        className={`h-full rounded-full bg-primary ${indicatorClassName}`}
        style={{ width: `${displayWidth}%`, transition: reduceMotion ? "width 0.001ms" : "none", ...indicatorStyle }}
      />
    </div>
  );
}

export function MotionCard({
  children,
  className = "",
  delay = 0
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={reduceMotion ? undefined : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: MOTION_DURATION.card,
        delay,
        ease: MOTION_EASE.default
      }}
      whileHover={reduceMotion ? undefined : { y: -2, transition: { duration: MOTION_DURATION.hover } }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function Pressable({
  children,
  className = "",
  onClick
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      whileTap={reduceMotion ? undefined : { scale: 0.98 }}
      transition={{ duration: MOTION_DURATION.press }}
      className={className}
      onClick={onClick}
    >
      {children}
    </motion.div>
  );
}

export function StaggerContainer({
  children,
  className = "",
  staggerDelay = 0.045
}: {
  children: React.ReactNode;
  className?: string;
  staggerDelay?: number;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={reduceMotion ? undefined : "hidden"}
      animate="visible"
      variants={{
        hidden: {},
        visible: {
          transition: {
            staggerChildren: staggerDelay,
            delayChildren: 0.04
          }
        }
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className = ""
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 8 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: MOTION_DURATION.row, ease: MOTION_EASE.default }
        }
      }}
      className={className}
      style={reduceMotion ? { opacity: 1 } : undefined}
    >
      {children}
    </motion.div>
  );
}

export function InlineFeedback({
  message,
  onClose,
  variant = "info"
}: {
  message?: string;
  onClose?: () => void;
  variant?: "info" | "error";
}) {
  const reduceMotion = useReducedMotion();
  if (!message) return null;

  const isError = variant === "error";
  return (
    <motion.div
      initial={reduceMotion ? undefined : { opacity: 0, scale: 0.95, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0.001 : 0.18, ease: MOTION_EASE.default }}
      className={`mb-3 rounded-[12px] border p-3 text-sm font-medium ${isError ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-primary/25 bg-primary/5 text-foreground"}`}
      role="status"
    >
      <div className="flex items-start justify-between gap-2">
        <span>{message}</span>
        {onClose ? (
          <button type="button" onClick={onClose} className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center text-xs underline opacity-70 hover:opacity-100">
            dismiss
          </button>
        ) : null}
      </div>
    </motion.div>
  );
}
