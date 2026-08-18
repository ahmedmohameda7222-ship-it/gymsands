"use client";

import Link from "next/link";
import { ArrowLeft, RefreshCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useActiveWorkoutTranslation } from "@/lib/i18n/active-workout";

function SkeletonBlock({ className }: { className: string }) {
  return <div aria-hidden="true" className={`rounded-md bg-muted/80 ${className}`} />;
}

export function ActiveWorkoutEntryLoading() {
  const { direction, t } = useActiveWorkoutTranslation();

  return (
    <section
      data-aw-entry-loading
      role="status"
      aria-live="polite"
      aria-busy="true"
      dir={direction}
      className="mx-auto flex min-h-[calc(100dvh-1rem)] w-full max-w-3xl flex-col py-3 motion-safe:animate-pulse motion-reduce:animate-none sm:py-5"
    >
      <span className="sr-only">{t("header.loadingSession")}</span>

      <div data-aw-entry-session-placeholder className="flex items-center justify-between gap-3 border-b border-border/70 pb-3 pt-12 sm:pt-14">
        <div className="min-w-0 flex-1 space-y-2">
          <SkeletonBlock className="h-3 w-24 max-w-[35vw]" />
          <SkeletonBlock className="h-5 w-40 max-w-[58vw]" />
        </div>
        <SkeletonBlock className="h-8 w-14 shrink-0" />
      </div>

      <div className="space-y-3 py-3">
        <SkeletonBlock className="h-3 w-28 max-w-[45vw]" />
        <SkeletonBlock className="h-7 w-3/4 max-w-xl" />
        <SkeletonBlock className="h-3 w-20 max-w-[35vw]" />
      </div>

      <div className="grid grid-cols-2 gap-3 border-y border-border/70 py-3">
        <div className="space-y-2">
          <SkeletonBlock className="h-3 w-16 max-w-full" />
          <SkeletonBlock className="h-14 w-full" />
        </div>
        <div className="space-y-2">
          <SkeletonBlock className="h-3 w-16 max-w-full" />
          <SkeletonBlock className="h-14 w-full" />
        </div>
      </div>

      <div className="space-y-3 py-3">
        <SkeletonBlock className="h-3 w-20" />
        <div className="flex gap-2">
          <SkeletonBlock className="h-9 w-9" />
          <SkeletonBlock className="h-9 w-9" />
          <SkeletonBlock className="h-9 w-9" />
        </div>
      </div>

      <div data-aw-entry-primary-placeholder className="mt-auto pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">
        <SkeletonBlock className="h-14 w-full" />
      </div>
    </section>
  );
}

export function ActiveWorkoutEntryError({
  onRetry,
  backHref
}: {
  onRetry: () => void;
  backHref: string;
}) {
  const { direction, t } = useActiveWorkoutTranslation();

  return (
    <section
      data-aw-entry-error
      role="alert"
      dir={direction}
      className="mx-auto flex min-h-[calc(100dvh-1rem)] w-full max-w-3xl items-center justify-center py-12"
    >
      <div className="w-full border-s-2 border-destructive/70 bg-card px-5 py-6 sm:px-6">
        <h1 className="text-xl font-semibold">{t("header.loadFailedTitle")}</h1>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
          {t("header.loadFailedDescription")}
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Button type="button" className="min-h-12 sm:min-w-36" onClick={onRetry}>
            <RefreshCcw className="h-4 w-4" aria-hidden="true" />
            {t("common.retry")}
          </Button>
          <Button asChild type="button" variant="outline" className="min-h-12 sm:min-w-36">
            <Link href={backHref} prefetch={false}>
              <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
              {t("common.back")}
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
