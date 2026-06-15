"use client";

import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Toast = {
  id: string;
  title: string;
  description?: string;
  variant?: "success" | "error" | "warning" | "info";
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

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const toast = useCallback(
    (nextToast: Omit<Toast, "id">) => {
      const id = crypto.randomUUID();
      setToasts((current) => [...current.slice(-2), { ...nextToast, id }]);
      window.setTimeout(() => removeToast(id), 3500);
    },
    [removeToast]
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
      <div className="fixed bottom-4 right-4 z-[70] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2 sm:bottom-6 sm:right-6">
        {toasts.map((item) => (
          (() => {
            const variant = variants[item.variant ?? "success"];
            const Icon = variant.icon;
            return (
          <div
            key={item.id}
            className={cn("rounded-lg border bg-card p-4 shadow-luxe", variant.className, "data-[state=open]:animate-in")}
          >
            <div className="flex items-start gap-3">
              <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", variant.iconClassName)} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-950">{item.title}</p>
                {item.description ? <p className="mt-1 text-sm text-slate-600">{item.description}</p> : null}
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeToast(item.id)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
            );
          })()
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function Toaster() {
  return null;
}
