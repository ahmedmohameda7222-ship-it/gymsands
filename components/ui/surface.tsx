import * as React from "react";
import { cn } from "@/lib/utils";

type SurfaceVariant = "glass" | "glassStrong" | "solid";

const surfaceVariants: Record<SurfaceVariant, string> = {
  glass: "glass-card",
  glassStrong: "glass-card-strong",
  solid: "solid-tracking-card"
};

export function Surface({
  variant = "glass",
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  variant?: SurfaceVariant;
}) {
  return <div className={cn(surfaceVariants[variant], className)} {...props} />;
}
