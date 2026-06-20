"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

export type SettingsToggleRowProps = {
  label: string;
  description?: string;
  defaultOn?: boolean;
  onChange?: (value: boolean) => void;
};

export function SettingsToggleRow({ label, description, defaultOn = false, onChange }: SettingsToggleRowProps) {
  const [on, setOn] = useState(defaultOn);

  function toggle() {
    const next = !on;
    setOn(next);
    onChange?.(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="flex min-h-[56px] w-full items-center justify-between gap-3 rounded-2xl border bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/45"
    >
      <span className="min-w-0">
        <span className="block font-semibold text-foreground">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-sm leading-5 text-muted-foreground">{description}</span>
        ) : null}
      </span>
      <span
        className={cn(
          "relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 transition-colors",
          on ? "border-primary bg-primary" : "border-muted-foreground/30 bg-muted"
        )}
      >
        <span
          className={cn(
            "inline-flex h-5 w-5 items-center justify-center rounded-full bg-white shadow transition-transform",
            on ? "translate-x-5" : "translate-x-0"
          )}
        >
          {on ? (
            <Eye className="h-3 w-3 text-primary" />
          ) : (
            <EyeOff className="h-3 w-3 text-muted-foreground" />
          )}
        </span>
      </span>
    </button>
  );
}
