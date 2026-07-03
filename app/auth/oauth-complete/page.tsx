import { Suspense } from "react";
import { OAuthCompleteClient } from "@/components/auth/oauth-complete-client";

export default function OAuthCompletePage() {
  return (
    <Suspense fallback={null}>
      <OAuthCompleteClient />
    </Suspense>
  );
}
