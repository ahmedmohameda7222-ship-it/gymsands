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
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="p-3 pt-3 sm:p-5 sm:pt-5">
        <div className="flex items-start justify-between gap-2 sm:gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground sm:text-sm">{label}</p>
            <p className="mt-1 text-lg font-semibold text-foreground sm:mt-2 sm:text-2xl">{value}</p>
            <p className="mt-0.5 text-xs text-muted-foreground sm:mt-1 sm:text-sm">{detail}</p>
          </div>
          <div className="rounded-md bg-primary/10 p-2 text-primary sm:p-3">
            <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
          </div>
        </div>
        {typeof progress === "number" ? <Progress value={progress} className="mt-3 sm:mt-4" /> : null}
      </CardContent>
    </Card>
  );
}
