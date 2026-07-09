import { Suspense } from "react";
import { ConsentCompletionClient } from "@/components/auth/consent-completion-client";

export default function ConsentCompletionPage() {
  return (
    <Suspense fallback={<AuthCallbackLoading label="Loading consent review..." />}>
      <ConsentCompletionClient />
    </Suspense>
  );
}

function AuthCallbackLoading({ label }: { label: string }) {
  return (
    <main className="premium-page-bg flex min-h-screen items-center justify-center px-4">
      <div className="rounded-[24px] border border-border/70 bg-card p-6 text-center shadow-luxe">
        <p className="text-lg font-semibold text-foreground">Plaivra</p>
        <p className="mt-2 text-sm text-muted-foreground">{label}</p>
      </div>
    </main>
  );
}
