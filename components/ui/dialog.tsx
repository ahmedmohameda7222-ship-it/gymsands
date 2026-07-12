"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  variant = "solid",
  layout = "dialog",
  closeLabel = "Close dialog",
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  variant?: "solid" | "glass";
  layout?: "dialog" | "responsive-drawer";
  closeLabel?: string;
}) {
  const layoutClasses =
    layout === "responsive-drawer"
      ? "fixed inset-x-0 bottom-0 top-auto z-[110] flex max-h-[85dvh] w-full max-w-full translate-x-0 translate-y-0 flex-col overflow-hidden overscroll-contain rounded-b-none rounded-t-[24px] border-x-0 border-b-0 p-0 shadow-luxe outline-none lg:inset-y-0 lg:left-auto lg:right-0 lg:top-0 lg:h-dvh lg:max-h-dvh lg:w-[min(32rem,100vw)] lg:max-w-[32rem] lg:rounded-none lg:border-y-0 lg:border-r-0 lg:translate-x-0 lg:translate-y-0 lg:rtl:left-0 lg:rtl:right-auto lg:rtl:border-l-0 lg:rtl:border-r"
      : "fixed inset-x-0 bottom-0 z-[110] max-h-[92dvh] w-full max-w-full overflow-y-auto overscroll-contain rounded-t-[24px] border-x-0 border-b-0 p-4 shadow-luxe outline-none sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:w-[calc(100vw-1.5rem)] sm:max-w-2xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[24px] sm:p-6";

  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-[100] bg-foreground/45" />
      <DialogPrimitive.Content
        className={cn(
          variant === "glass" ? "glass-shell" : "solid-tracking-card",
          layoutClasses,
          className
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close asChild>
          <Button
            className="absolute right-3 top-3 z-20 min-h-11 min-w-11 rtl:left-3 rtl:right-auto"
            variant="ghost"
            size="icon"
            aria-label={closeLabel}
            title={closeLabel}
          >
            <X className="h-4 w-4" />
          </Button>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-4 flex flex-col gap-1.5 pr-9 rtl:pl-9 rtl:pr-0", className)} {...props} />;
}

export function DialogTitle({ className, ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("text-lg font-semibold", className)} {...props} />;
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn("text-sm text-muted-foreground", className)} {...props} />;
}
