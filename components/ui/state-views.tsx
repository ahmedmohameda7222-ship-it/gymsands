import Link from "next/link";
import { AlertTriangle, ArrowRight, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  secondaryLabel,
  secondaryHref,
  className
}: {
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  secondaryHref?: string;
  className?: string;
}) {
  const primary = actionLabel
    ? actionHref
      ? <Button asChild><Link href={actionHref}>{actionLabel}<ArrowRight className="h-4 w-4" /></Link></Button>
      : <Button type="button" onClick={onAction}>{actionLabel}<ArrowRight className="h-4 w-4" /></Button>
    : null;

  return (
    <Card className={cn("glass-card-strong border-dashed", className)}>
      <CardContent className="flex flex-col items-start gap-4 p-5 sm:p-6">
        <div>
          <p className="text-lg font-semibold text-foreground">{title}</p>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        {(primary || secondaryLabel) ? (
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
            {primary}
            {secondaryLabel && secondaryHref ? <Button asChild variant="outline"><Link href={secondaryHref}>{secondaryLabel}</Link></Button> : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function ErrorState({
  title = "Something did not load",
  description,
  onRetry,
  retryLabel = "Try again",
  fallbackLabel,
  fallbackHref,
  details,
  className
}: {
  title?: string;
  description: string;
  onRetry?: () => void;
  retryLabel?: string;
  fallbackLabel?: string;
  fallbackHref?: string;
  details?: string;
  className?: string;
}) {
  return (
    <Card className={cn("border-destructive/30 bg-destructive/5", className)}>
      <CardContent className="space-y-4 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div>
            <p className="font-semibold text-foreground">{title}</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
            {details ? (
              <details className="mt-3 rounded-md border bg-background p-3 text-xs text-muted-foreground">
                <summary className="cursor-pointer font-semibold text-foreground">Technical details</summary>
                <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap">{details}</pre>
              </details>
            ) : null}
          </div>
        </div>
        {(onRetry || fallbackLabel) ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {onRetry ? <Button type="button" onClick={onRetry}><RefreshCcw className="h-4 w-4" />{retryLabel}</Button> : null}
            {fallbackLabel && fallbackHref ? <Button asChild variant="outline"><Link href={fallbackHref}>{fallbackLabel}</Link></Button> : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function CardSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <Card className={cn("glass-card", className)} aria-busy="true" aria-label="Loading content">
      <CardHeader>
        <SkeletonLine className="h-5 w-1/2" />
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: rows }).map((_, index) => <SkeletonLine key={index} className={index === rows - 1 ? "w-2/3" : "w-full"} />)}
      </CardContent>
    </Card>
  );
}

export function CardGridSkeleton({ count = 3, rows = 3, className }: { count?: number; rows?: number; className?: string }) {
  return (
    <div className={cn("grid gap-4 md:grid-cols-2 xl:grid-cols-3", className)}>
      {Array.from({ length: count }).map((_, index) => <CardSkeleton key={index} rows={rows} />)}
    </div>
  );
}

export function SkeletonLine({ className }: { className?: string }) {
  return <div className={cn("h-4 animate-pulse rounded-md bg-muted", className)} />;
}

export function AdminMigrationNotice({ migrationName }: { migrationName?: string }) {
  return (
    <ErrorState
      title="Admin setup needs the latest migration"
      description={`This admin feature depends on database objects that are not available yet. Apply ${migrationName ?? "the latest Supabase migration"} in the Supabase SQL Editor, then retry.`}
    />
  );
}
