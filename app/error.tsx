"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    void fetch("/api/observability/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error_code: "route_error", digest: error.digest, route: window.location.pathname }),
      keepalive: true
    }).catch(() => undefined);
  }, [error.digest]);

  return (
    <main className="premium-page-bg flex min-h-[60vh] items-center justify-center p-4">
      <div className="w-full max-w-md rounded-[22px] bg-card p-6 text-center shadow-soft">
        <h1 className="text-xl font-semibold">This Plaivra view could not load</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Retry the view. Your saved data was not changed by this error screen.</p>
        <Button type="button" className="mt-5 min-h-12" onClick={reset}>Try again</Button>
      </div>
    </main>
  );
}
