"use client";

import { useEffect, useRef } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const ITEM_HEIGHT = 44;

export function WheelPicker({
  label,
  value,
  values,
  suffix,
  onChange,
  className
}: {
  label: string;
  value: number | null;
  values: readonly number[];
  suffix?: string;
  onChange: (value: number) => void;
  className?: string;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (value === null) return;
    const index = values.indexOf(value);
    const viewport = viewportRef.current;
    if (index < 0 || !viewport) return;
    viewport.scrollTo({ top: index * ITEM_HEIGHT, behavior: "smooth" });
  }, [value, values]);

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
  }, []);

  function selectNearest() {
    const viewport = viewportRef.current;
    if (!viewport || values.length === 0) return;
    const index = Math.max(0, Math.min(values.length - 1, Math.round(viewport.scrollTop / ITEM_HEIGHT)));
    if (values[index] !== value) onChange(values[index]);
  }

  function handleScroll() {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(selectNearest);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key) || values.length === 0) return;
    event.preventDefault();
    const currentIndex = value === null ? 0 : Math.max(0, values.indexOf(value));
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? values.length - 1
        : Math.max(0, Math.min(values.length - 1, currentIndex + (event.key === "ArrowUp" ? -1 : 1)));
    onChange(values[nextIndex]);
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-3">
        <Label>{label}</Label>
        <span className="text-sm font-semibold text-primary">{value === null ? "Not set" : `${value}${suffix ? ` ${suffix}` : ""}`}</span>
      </div>
      <div className="relative overflow-hidden rounded-[18px] border border-border/80 bg-card shadow-inner">
        <div className="pointer-events-none absolute inset-x-2 top-1/2 z-10 h-11 -translate-y-1/2 rounded-xl border border-primary/30 bg-primary/10" />
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-16 bg-gradient-to-b from-card via-card/85 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-16 bg-gradient-to-t from-card via-card/85 to-transparent" />
        <div
          ref={viewportRef}
          role="listbox"
          aria-label={label}
          aria-activedescendant={value === null ? undefined : `wheel-${label.replace(/\s+/g, "-").toLowerCase()}-${value}`}
          tabIndex={0}
          onScroll={handleScroll}
          onKeyDown={handleKeyDown}
          className="h-[220px] snap-y snap-mandatory overflow-y-auto overscroll-contain py-[88px] scrollbar-thin focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          {values.map((item) => {
            const selected = item === value;
            return (
              <button
                key={item}
                id={`wheel-${label.replace(/\s+/g, "-").toLowerCase()}-${item}`}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => onChange(item)}
                className={cn(
                  "relative z-30 flex h-11 w-full snap-center items-center justify-center px-4 text-center text-sm transition",
                  selected ? "scale-105 font-bold text-primary" : "font-medium text-muted-foreground"
                )}
              >
                {item}{suffix ? <span className="ms-1 text-xs opacity-75">{suffix}</span> : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
