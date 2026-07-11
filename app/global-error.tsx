"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    void fetch("/api/observability/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error_code: "global_error", digest: error.digest, route: window.location.pathname }),
      keepalive: true
    }).catch(() => undefined);
  }, [error.digest]);

  return (
    <html lang="en">
      <body className="font-sans">
        <main className="premium-page-bg flex min-h-screen items-center justify-center p-4">
          <div className="w-full max-w-md rounded-[22px] bg-card p-6 text-center shadow-soft">
            <h1 className="text-xl font-semibold">Plaivra could not continue</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">A minimized error signal was recorded. No workout, nutrition, profile, or prompt text was included.</p>
            <button type="button" className="mt-5 min-h-12 rounded-xl bg-primary px-5 font-semibold text-primary-foreground" onClick={reset}>Try again</button>
          </div>
        </main>
      </body>
    </html>
  );
}
