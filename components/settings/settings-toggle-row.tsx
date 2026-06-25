"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type SettingsToggleRowProps = {
  label: string;
  description?: string;
  defaultOn?: boolean;
  onChange?: (value: boolean) => void;
};

export function SettingsToggleRow({ label, description, defaultOn = false, onChange }: SettingsToggleRowProps) {
  const [on, setOn] = useState(defaultOn);

  useEffect(() => {
    setOn(defaultOn);
  }, [defaultOn]);

  function toggle() {
    const next = !on;
    setOn(next);
    onChange?.(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="solid-row flex min-h-[56px] w-full items-center justify-between gap-3 p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/45"
    >
      <span className="min-w-0">
        <span className="block font-semibold text-foreground">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-sm leading-5 text-muted-foreground">{description}</span>
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
