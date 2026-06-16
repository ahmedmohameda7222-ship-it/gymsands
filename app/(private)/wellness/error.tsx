"use client";

import { RouteError } from "@/components/ui/route-error";

export default function WellnessError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError error={error} reset={reset} />;
}
