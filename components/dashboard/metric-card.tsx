import { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  progress,
  className
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  progress?: number;
  className?: string;
}) {
  return (
    <Card className={cn("glass-card overflow-hidden", className)}>
      <CardContent className="p-3.5 pt-3.5 sm:p-5 sm:pt-5">
        <div className="flex items-start justify-between gap-2 sm:gap-3">
          <div className="min-w-0">
            <p className="text-[13px] font-bold leading-5 text-muted-foreground">{label}</p>
            <p className="mt-1 text-[28px] font-extrabold leading-none tracking-[-0.055em] text-foreground sm:mt-2 sm:text-[34px]">{value}</p>
            <p className="mt-1 text-xs font-medium text-muted-foreground sm:text-[13px]">{detail}</p>
          </div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/45 text-primary backdrop-blur-md dark:bg-white/10 sm:h-[42px] sm:w-[42px]">
            <Icon className="h-5 w-5" />
          </div>
        </div>
        {typeof progress === "number" ? <Progress value={progress} className="mt-3 sm:mt-4" /> : null}
      </CardContent>
    </Card>
  );
}
