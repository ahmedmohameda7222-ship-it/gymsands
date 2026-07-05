"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

export function WorkoutSessionScreen({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isClosing, setIsClosing] = useState(false);
  const timerRef = useRef<number | null>(null);

  function handleClose() {
    if (isClosing) return;
    setIsClosing(true);
    timerRef.current = window.setTimeout(() => router.back(), 380);
  }

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  return (
    <motion.div
      className="absolute inset-0 z-50 flex flex-col bg-background"
      style={{ willChange: "transform" }}
      initial={{ y: "100%" }}
      animate={isClosing ? { y: "100%" } : { y: 0 }}
      transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
    >
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={handleClose}
        className="absolute left-3 top-3 z-[40] h-10 w-10 rounded-full bg-card/95 shadow-lg backdrop-blur"
        aria-label="Close workout session"
      >
        <ChevronDown className="h-5 w-5" />
      </Button>
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 sm:px-6 sm:pt-5 lg:px-8">
        {children}
      </div>
    </motion.div>
  );
}
