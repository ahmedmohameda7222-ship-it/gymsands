import { Suspense } from "react";
import { OAuthCompleteClient } from "@/components/auth/oauth-complete-client";

export default function OAuthCompletePage() {
  return (
    <Suspense fallback={<AuthCallbackLoading label="Finishing sign-in..." />}>
      <OAuthCompleteClient />
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
