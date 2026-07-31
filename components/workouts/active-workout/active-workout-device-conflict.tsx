"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ActiveWorkoutTranslator } from "@/lib/i18n/active-workout";

export function ActiveWorkoutDeviceConflict({
  active,
  busy,
  online,
  backHref,
  takeoverOpen,
  onTakeoverOpenChange,
  onViewCurrent,
  onConfirmTakeover,
  tr,
}: {
  active: boolean;
  busy: boolean;
  online: boolean;
  backHref: string;
  takeoverOpen: boolean;
  onTakeoverOpenChange: (open: boolean) => void;
  onViewCurrent: () => void;
  onConfirmTakeover: () => void;
  tr: ActiveWorkoutTranslator;
}) {
  if (!active) return null;

  return (
    <>
      <section
        data-aw9-device-conflict
        role="status"
        className="fixed inset-x-3 top-3 z-[65] mx-auto max-w-xl rounded-[18px] border border-warning/40 bg-background/95 p-4 shadow-lg backdrop-blur"
      >
        <h2 className="font-semibold">{tr("multiDevice.activeElsewhere")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {tr("multiDevice.viewOnly")}
        </p>
        <div className="mt-3 grid gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 w-full"
            onClick={onViewCurrent}
          >
            {tr("multiDevice.viewCurrent")}
          </Button>
          <Button
            type="button"
            className="min-h-11 w-full"
            onClick={() => onTakeoverOpenChange(true)}
            disabled={busy || !online}
          >
            {tr("multiDevice.takeOver")}
          </Button>
          <Button asChild variant="ghost" className="min-h-11 w-full">
            <Link href={backHref} prefetch={false}>
              {tr("multiDevice.goBack")}
            </Link>
          </Button>
        </div>
      </section>

      <Dialog open={takeoverOpen} onOpenChange={onTakeoverOpenChange}>
        <DialogContent data-aw9-takeover-confirmation className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{tr("multiDevice.takeoverConfirmTitle")}</DialogTitle>
            <DialogDescription>
              {tr("multiDevice.takeoverConfirmDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="min-h-12"
              onClick={() => onTakeoverOpenChange(false)}
              disabled={busy}
            >
              {tr("common.back")}
            </Button>
            <Button
              type="button"
              className="min-h-12"
              onClick={onConfirmTakeover}
              disabled={busy}
            >
              {tr("multiDevice.confirmTakeover")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
