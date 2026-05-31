import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

export function Progress({
  value,
  className,
  indicatorStyle
}: {
  value: number;
  className?: string;
  indicatorStyle?: CSSProperties;
}) {
  const safeValue = Math.min(100, Math.max(0, value));
  return (
    <div className={cn("h-2.5 w-full overflow-hidden rounded-full bg-blue-100", className)}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-sky-400 to-blue-600 transition-all duration-500"
        style={{ width: `${safeValue}%`, ...indicatorStyle }}
      />
    </div>
  );
}
