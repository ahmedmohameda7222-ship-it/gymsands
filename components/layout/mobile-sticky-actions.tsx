"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export type MobileStickyActionsPlacement = "app" | "session";

type StickyVisibilityOptions = {
  placement: MobileStickyActionsPlacement;
  allowOnSession: boolean;
};

function useDisableStickyActions({
  placement,
  allowOnSession
}: StickyVisibilityOptions) {
  const pathname = usePathname();
  const sessionPlacement = placement === "session" || allowOnSession;
  return !sessionPlacement && pathname.startsWith("/workouts/session");
}

type MobileStickyActionsProps = React.HTMLAttributes<HTMLDivElement> & {
  placement?: MobileStickyActionsPlacement;
  /** @deprecated Use placement="session" for full-screen workout execution. */
  allowOnSession?: boolean;
};

export function MobileStickyActions({
  className,
  children,
  placement = "app",
  allowOnSession = false,
  ...props
}: MobileStickyActionsProps) {
  const disabled = useDisableStickyActions({ placement, allowOnSession });

  if (disabled) return null;

  const resolvedPlacement = placement === "session" || allowOnSession
    ? "session"
    : "app";

  return (
    <div
      data-mobile-sticky-placement={resolvedPlacement}
      className={cn(
        "fixed inset-x-0 z-30 border-t bg-card/95 px-4 pt-3 shadow-luxe backdrop-blur lg:hidden",
        resolvedPlacement === "session"
          ? "bottom-0 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
          : "bottom-[calc(4.25rem+env(safe-area-inset-bottom))] pb-3",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

type MobileStickyActionsSpacerProps = {
  className?: string;
  placement?: MobileStickyActionsPlacement;
  /** @deprecated Use placement="session" for full-screen workout execution. */
  allowOnSession?: boolean;
};

export function MobileStickyActionsSpacer({
  className,
  placement = "app",
  allowOnSession = false
}: MobileStickyActionsSpacerProps) {
  const disabled = useDisableStickyActions({ placement, allowOnSession });

  if (disabled) return null;

  const resolvedPlacement = placement === "session" || allowOnSession
    ? "session"
    : "app";

  return (
    <div
      aria-hidden="true"
      data-mobile-sticky-spacer={resolvedPlacement}
      className={cn(
        resolvedPlacement === "session"
          ? "h-[calc(5.25rem+env(safe-area-inset-bottom))] lg:hidden"
          : "h-24 lg:hidden",
        className
      )}
    />
  );
}
