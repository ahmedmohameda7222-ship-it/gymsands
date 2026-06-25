import * as React from "react";
import { cn } from "@/lib/utils";

export function BentoGrid({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("bento-grid", className)} {...props} />;
}
