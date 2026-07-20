import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { OpenAiBlossom } from "@/components/brand/openai-blossom";
import { cn } from "@/lib/utils";

export function TrainPageContainer({
  children,
  className,
  withGutters = false,
  ...props
}: ComponentPropsWithoutRef<"div"> & {
  children: ReactNode;
  withGutters?: boolean;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[1240px] max-[340px]:pb-[var(--active-workout-controller-height)]",
        withGutters && "px-4 sm:px-5 md:px-6 lg:px-8 xl:px-10",
        className
      )}
      data-train-page-container
      {...props}
    >
      {children}
    </div>
  );
}

export function OpenAiActionContent({ children, primary = false }: { children: ReactNode; primary?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <OpenAiBlossom className={primary ? "h-[18px] w-[18px]" : "h-4 w-4"} />
      <span>{children}</span>
    </span>
  );
}

export function TrainStickyFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "sticky bottom-[var(--train-sticky-footer-bottom)] z-30 -mx-4 border-t border-border/80 bg-background/95 px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:mx-auto sm:w-full sm:rounded-2xl sm:border lg:bottom-[var(--desktop-train-sticky-footer-bottom)] lg:pb-3",
        className
      )}
      data-train-sticky-footer
    >
      {children}
    </div>
  );
}
