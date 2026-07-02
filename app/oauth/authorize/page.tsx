import { Suspense } from "react";
import { OAuthConsent } from "@/components/auth/oauth-consent";

export default function OAuthAuthorizePage() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading authorization request...</main>}>
      <OAuthConsent />
    </Suspense>
  );
}
