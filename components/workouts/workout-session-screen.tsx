"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTrainTranslation } from "@/lib/i18n/train";

export function WorkoutSessionScreen({ children, confirmExit = false }: { children: React.ReactNode; confirmExit?: boolean }) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const { dir, tr } = useTrainTranslation();
  const [isClosing, setIsClosing] = useState(false);
  const [exitDialogOpen, setExitDialogOpen] = useState(false);

  function handleClose() {
    if (isClosing) return;
    if (confirmExit) {
      setExitDialogOpen(true);
      return;
    }
    setIsClosing(true);
  }

  function closeSession() {
    setExitDialogOpen(false);
    setIsClosing(true);
  }

  return (
    <motion.div
      className="absolute inset-0 z-50 flex flex-col bg-background"
      style={{ willChange: "transform" }}
      initial={reduceMotion ? false : { y: "100%" }}
      animate={isClosing ? { y: "100%" } : { y: 0 }}
      transition={{ duration: reduceMotion ? 0.001 : 0.38, ease: [0.22, 1, 0.36, 1] }}
      onAnimationComplete={() => {
        if (isClosing) router.back();
      }}
      dir={dir}
    >
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={handleClose}
        className="absolute end-3 top-3 z-[40] h-12 w-12 rounded-full bg-card/95 shadow-lg backdrop-blur"
        aria-label={tr("closeWorkoutSession")}
      >
        <ChevronDown className="h-5 w-5" />
      </Button>
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 sm:px-6 sm:pt-5 lg:px-8">
        {children}
      </div>
      <Dialog open={exitDialogOpen} onOpenChange={setExitDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{tr("exitWorkoutSession")}</DialogTitle>
            <DialogDescription>{tr("exitWorkoutDescription")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" className="min-h-12" onClick={() => setExitDialogOpen(false)}>
              {tr("keepTraining")}
            </Button>
            <Button type="button" className="min-h-12" onClick={closeSession}>
              {tr("exitSession")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
