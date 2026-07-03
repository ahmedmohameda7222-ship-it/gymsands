"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function Disclosure({
  title,
  description,
  children,
  defaultOpen = false,
  className
}: {
  title: string;
  description?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={cn("rounded-[16px] border border-border/70 bg-card", className)}>
      <button
        type="button"
        className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <span>
          <span className="block text-sm font-semibold text-foreground">{title}</span>
          {description ? <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span> : null}
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open ? <div className="border-t border-border/60 p-4">{children}</div> : null}
    </div>
  );
}
