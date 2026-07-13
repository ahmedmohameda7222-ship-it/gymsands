"use client";

import { AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { reportClientError } from "@/lib/observability/client-error";

export function RouteError({
  error,
  reset,
  title = "Something went wrong",
  description = "This page could not load properly. Try again or return to the dashboard.",
  retryLabel = "Try again",
  dashboardLabel = "Dashboard"
}: {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
  description?: string;
  retryLabel?: string;
  dashboardLabel?: string;
}) {
  const router = useRouter();

  useEffect(() => {
    reportClientError({ error, digest: error.digest, boundarySource: "route" });
  }, [error]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-4" role="alert">
      <div className="w-full max-w-md space-y-4 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-warning/10">
          <AlertTriangle className="h-6 w-6 text-warning" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button type="button" onClick={reset}>{retryLabel}</Button>
          <Button type="button" variant="outline" onClick={() => router.push("/dashboard")}>{dashboardLabel}</Button>
        </div>
      </div>
    </div>
  );
}
