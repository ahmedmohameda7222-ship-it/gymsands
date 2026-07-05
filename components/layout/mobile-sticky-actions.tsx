"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

function useDisableStickyActions() {
  const pathname = usePathname();
  return pathname.startsWith("/workouts/session");
}

export function MobileStickyActions({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const disabled = useDisableStickyActions();

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

export function MobileStickyActionsSpacer({ className }: { className?: string }) {
  const disabled = useDisableStickyActions();

  if (disabled) return null;

  return <div aria-hidden="true" className={cn("h-24 lg:hidden", className)} />;
}
