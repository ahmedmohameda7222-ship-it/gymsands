"use client";

import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { transientFeedbackDuration, type TransientFeedbackKind } from "@/lib/feedback/transient-feedback";
import { cn } from "@/lib/utils";

type ToastVariant = "success" | "error" | "warning" | "info";

type Toast = {
  id: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
  actionLabel?: string;
  onAction?: () => void;
  /** null keeps an action-required toast visible until it is resolved/dismissed. */
  durationMs?: number | null;
};

type ToastContextValue = {
  toast: (toast: Omit<Toast, "id">) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside ToastProvider");
  }
  return context;
}

function inferToastVariant(toast: Pick<Toast, "title" | "variant">): ToastVariant {
  if (toast.variant) return toast.variant;
  if (/could not|failed|error|invalid/i.test(toast.title)) return "error";
  if (/required|check|unavailable/i.test(toast.title)) return "warning";
  return "success";
}

function timingKind(variant: ToastVariant): TransientFeedbackKind {
  return variant === "success" ? "success" : variant === "info" ? "info" : variant;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef(new Map<string, number>());

  const clearTimer = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer !== undefined) window.clearTimeout(timer);
    timersRef.current.delete(id);
  }, []);

  const removeToast = useCallback((id: string) => {
    clearTimer(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, [clearTimer]);

  useEffect(() => () => {
    for (const timer of timersRef.current.values()) window.clearTimeout(timer);
    timersRef.current.clear();
  }, []);

  const toast = useCallback(
    (nextToast: Omit<Toast, "id">) => {
      const id = crypto.randomUUID();
      const variant = inferToastVariant(nextToast);
      const actionable = Boolean(nextToast.actionLabel && nextToast.onAction);
      const duration = nextToast.durationMs === undefined
        ? actionable ? null : transientFeedbackDuration(timingKind(variant))
        : nextToast.durationMs;

      setToasts((current) => {
        if (current.some((item) => item.title === nextToast.title && item.description === nextToast.description)) {
          return current;
        }
        const persistent = current.filter((item) => Boolean(item.actionLabel && item.onAction));
        for (const item of current) {
          if (!persistent.includes(item)) clearTimer(item.id);
        }
        return [...persistent.slice(-1), { ...nextToast, id }];
      });

      if (duration !== null) {
        const timer = window.setTimeout(() => removeToast(id), Math.max(500, duration));
        timersRef.current.set(id, timer);
      }
    },
    [clearTimer, removeToast]
  );

  const value = useMemo(() => ({ toast }), [toast]);
  const variants = {
    success: { icon: CheckCircle2, className: "border-primary/30", iconClassName: "text-primary" },
    error: { icon: XCircle, className: "border-destructive/35", iconClassName: "text-destructive" },
    warning: { icon: AlertTriangle, className: "border-secondary/60", iconClassName: "text-accent" },
    info: { icon: Info, className: "border-border/70", iconClassName: "text-muted-foreground" }
  } as const;

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-24 right-4 z-[70] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2 sm:bottom-6 sm:right-6" aria-live="polite" aria-relevant="additions removals">
        {toasts.map((item) => {
          const variantName = inferToastVariant(item);
          const variant = variants[variantName];
          const Icon = variant.icon;
          return (
            <div
              key={item.id}
              className={cn("rounded-lg border bg-card p-4 shadow-luxe", variant.className, "data-[state=open]:animate-in")}
              role={variantName === "error" ? "alert" : "status"}
            >
              <div className="flex items-start gap-3">
                <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", variant.iconClassName)} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">{item.title}</p>
                  {item.description ? <p className="mt-1 text-sm text-muted-foreground">{item.description}</p> : null}
                  {item.actionLabel && item.onAction ? (
                    <Button type="button" variant="ghost" className="mt-1 h-auto min-h-0 p-0 text-primary" onClick={item.onAction}>
                      {item.actionLabel}
                    </Button>
                  ) : null}
                </div>
                <Button variant="ghost" size="icon" onClick={() => removeToast(item.id)} aria-label={`Dismiss ${item.title} notification`} title="Dismiss notification">
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function Toaster() {
  return null;
}
