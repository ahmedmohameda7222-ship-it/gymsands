"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useAuth } from "@/components/auth/auth-provider";
import { safeInternalRedirectPath } from "@/lib/auth/redirect";
import { defaultStartPageToPath } from "@/services/database/user-settings";

const AUTH_ENTRY_PATHS = ["/login", "/register", "/auth/"] as const;

export function resolveAuthenticatedLoginDestination(
  requestedNext: string | null,
  fallback: string,
) {
  const candidate = requestedNext
    ? safeInternalRedirectPath(requestedNext)
    : fallback;
  const isAuthEntry = AUTH_ENTRY_PATHS.some((path) =>
    path.endsWith("/")
      ? candidate.startsWith(path)
      : candidate === path || candidate.startsWith(`${path}?`),
  );
  return isAuthEntry ? fallback : candidate;
}

export function AuthenticatedLoginRedirect() {
  const { user, bootstrap, bootstrapStatus, isLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedNext = searchParams.get("next");

  useEffect(() => {
    if (isLoading || !user) return;

    if (requestedNext) {
      router.replace(
        resolveAuthenticatedLoginDestination(requestedNext, "/dashboard"),
      );
      return;
    }

    if (bootstrapStatus === "idle" || bootstrapStatus === "loading") return;

    const fallback =
      bootstrapStatus === "ready" && bootstrap?.userId === user.id
        ? defaultStartPageToPath(
            bootstrap.settings?.defaultStartPage ?? "today",
          )
        : "/dashboard";
    router.replace(resolveAuthenticatedLoginDestination(null, fallback));
  }, [
    bootstrap,
    bootstrapStatus,
    isLoading,
    requestedNext,
    router,
    user,
  ]);

  return null;
}
