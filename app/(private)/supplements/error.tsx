"use client";

import { RouteError } from "@/components/ui/route-error";

export default function SupplementsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError error={error} reset={reset} />;
}
