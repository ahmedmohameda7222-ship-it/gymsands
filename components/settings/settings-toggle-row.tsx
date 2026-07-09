"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type SettingsToggleRowProps = {
  label: string;
  description?: string;
  defaultOn?: boolean;
  disabled?: boolean;
  status?: "pending" | "saved" | "error";
  statusText?: string;
  onChange?: (value: boolean) => void;
};

export function SettingsToggleRow({ label, description, defaultOn = false, disabled = false, status, statusText, onChange }: SettingsToggleRowProps) {
  const [on, setOn] = useState(defaultOn);

  useEffect(() => {
    setOn(defaultOn);
  }, [defaultOn]);

  function toggle() {
    if (disabled) return;
    const next = !on;
    setOn(next);
    onChange?.(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled}
      aria-pressed={on}
      className="solid-row flex min-h-[56px] w-full items-center justify-between gap-3 p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/45 disabled:cursor-not-allowed disabled:opacity-70"
    >
      <span className="min-w-0">
        <span className="block font-semibold text-foreground">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-sm leading-5 text-muted-foreground">{description}</span>
        ) : null}
        {statusText ? (
          <span className={cn("mt-1 flex items-center gap-1 text-xs font-medium", status === "error" ? "text-destructive" : "text-muted-foreground")}>
            {status === "pending" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {statusText}
          </span>
        ) : null}
      </span>
      <span
        className={cn(
          "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition-colors",
          on ? "bg-primary" : "bg-muted"
        )}
        aria-hidden="true"
      >
        <span
          className={cn(
            "h-5 w-5 rounded-full bg-white shadow transition-transform",
            on ? "translate-x-5" : "translate-x-0"
          )}
        />
      </span>
    </button>
  );
}
