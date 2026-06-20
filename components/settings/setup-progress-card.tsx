"use client";

import Link from "next/link";
import { CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/use-translation";

type SetupItem = {
  label: string;
  done: boolean;
  href: string;
  action: string;
};

export function SetupProgressCard({
  checklist,
  nextItem,
  completedCount,
  totalCount
}: {
  checklist: SetupItem[];
  nextItem: SetupItem | null;
  completedCount: number;
  totalCount: number;
}) {
  const { t } = useTranslation();

  if (completedCount >= totalCount) return null;

  return (
    <Card className="overflow-hidden border-primary/20 bg-primary/5">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">
              {nextItem ? `${t("setup.next")}: ${nextItem.label}` : t("setup.inProgress")}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Progress value={(completedCount / totalCount) * 100} className="h-2 flex-1" />
              <span className="text-xs text-muted-foreground">
                {completedCount}/{totalCount}
              </span>
            </div>
          </div>
          {nextItem ? (
            <Button asChild size="sm" className="shrink-0">
              <Link href={nextItem.href}>{nextItem.action}</Link>
            </Button>
          ) : null}
        </div>

        <details className="group mt-3">
          <summary className="flex cursor-pointer list-none items-center gap-1 text-xs text-muted-foreground">
            <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
            {t("setup.showAll")}
          </summary>
          <div className="mt-3 space-y-2 border-t border-primary/10 pt-3">
            {checklist.map((item) => (
              <div key={item.label} className="flex items-center justify-between gap-2 text-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <CheckCircle2
                    className={cn(
                      "h-4 w-4 shrink-0",
                      item.done ? "text-primary" : "text-muted-foreground"
                    )}
                  />
                  <span
                    className={cn(
                      "truncate",
                      item.done ? "text-muted-foreground line-through" : "text-foreground"
                    )}
                  >
                    {item.label}
                  </span>
                </div>
                {!item.done ? (
                  <Button asChild size="sm" variant="ghost" className="shrink-0">
                    <Link href={item.href}>
                      {item.action}
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
