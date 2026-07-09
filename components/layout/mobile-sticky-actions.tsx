"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

function useDisableStickyActions(allowOnSession = false) {
  const pathname = usePathname();
  return !allowOnSession && pathname.startsWith("/workouts/session");
}

type MobileStickyActionsProps = React.HTMLAttributes<HTMLDivElement> & {
  allowOnSession?: boolean;
};

export function MobileStickyActions({ className, children, allowOnSession = false, ...props }: MobileStickyActionsProps) {
  const disabled = useDisableStickyActions(allowOnSession);

  if (disabled) return null;

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-30 border-t bg-card/95 px-4 py-3 shadow-luxe backdrop-blur lg:hidden",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function MobileStickyActionsSpacer({ className, allowOnSession = false }: { className?: string; allowOnSession?: boolean }) {
  const disabled = useDisableStickyActions(allowOnSession);

  if (disabled) return null;

  return <div aria-hidden="true" className={cn("h-24 lg:hidden", className)} />;
}
