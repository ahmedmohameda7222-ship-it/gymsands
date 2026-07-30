"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import type { ActiveWorkoutTranslator } from "@/lib/i18n/active-workout";

export function ActiveWorkoutConflict({
  resumeHref,
  backHref,
  busy,
  onCancelAndStart,
  tr
}: {
  resumeHref: string;
  backHref: string;
  busy: boolean;
  onCancelAndStart: () => void;
  tr: ActiveWorkoutTranslator;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <section
        data-aw7-active-session-conflict
        className="mx-auto mt-20 w-full max-w-lg rounded-[24px] border border-warning/35 bg-card p-5 shadow-lg"
        aria-labelledby="aw7-conflict-title"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-warning/10 text-warning">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h1 id="aw7-conflict-title" className="text-lg font-semibold">
              {tr("conflict.title")}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {tr("conflict.description")}
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-2">
          <Button asChild className="min-h-12">
            <Link href={resumeHref} prefetch={false}>{tr("conflict.resume")}</Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-12 border-destructive/35 text-destructive hover:text-destructive"
            onClick={() => setConfirmOpen(true)}
            disabled={busy}
          >
            {tr("conflict.cancelAndStart")}
          </Button>
          <Button asChild variant="ghost" className="min-h-12">
            <Link href={backHref} prefetch={false}>{tr("conflict.goBack")}</Link>
          </Button>
        </div>
      </section>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent
          data-aw7-conflict-cancel-confirmation
          className="sm:max-w-md"
        >
          <DialogHeader>
            <DialogTitle>{tr("conflict.confirmTitle")}</DialogTitle>
            <DialogDescription>{tr("conflict.confirmDescription")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" className="min-h-12" onClick={() => setConfirmOpen(false)} disabled={busy}>
              {tr("common.back")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="min-h-12"
              onClick={() => {
                setConfirmOpen(false);
                onCancelAndStart();
              }}
              disabled={busy}
            >
              {tr("conflict.confirmCancel")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
