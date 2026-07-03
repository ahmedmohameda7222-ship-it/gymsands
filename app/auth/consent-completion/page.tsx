import { Suspense } from "react";
import { ConsentCompletionClient } from "@/components/auth/consent-completion-client";

export default function ConsentCompletionPage() {
  return (
    <Suspense fallback={null}>
      <ConsentCompletionClient />
    </Suspense>
  );
}
