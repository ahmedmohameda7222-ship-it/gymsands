"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function Disclosure({
  title,
  description,
  children,
  defaultOpen = false,
  className,
  actions,
  contentClassName,
  toggleLabel
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  actions?: ReactNode;
  contentClassName?: string;
  toggleLabel?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  const triggerId = `${id}-trigger`;
  const panelId = `${id}-panel`;
  return (
    <div className={cn("rounded-[16px] border border-border/70 bg-card", className)}>
      <div className="flex min-h-14 items-stretch">
        <button
          id={triggerId}
          type="button"
          className="flex min-h-14 min-w-0 flex-1 items-center justify-between gap-3 rounded-s-[16px] px-4 py-3 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={toggleLabel}
        >
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-foreground">{title}</span>
            {description ? <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span> : null}
          </span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none", open && "rotate-180")} aria-hidden="true" />
        </button>
        {actions ? <div className="flex shrink-0 items-center pe-2">{actions}</div> : null}
      </div>
      <div
        id={panelId}
        role="region"
        aria-labelledby={triggerId}
        hidden={!open}
        className={cn("border-t border-border/60 p-4", contentClassName)}
      >
        {children}
      </div>
    </div>
  );
}
