import type { PrivateAppBootstrap } from "@/lib/auth/private-app-bootstrap";

export type BootstrapStatus = "idle" | "loading" | "ready" | "error";

export type PrivateRouteGateDecision =
  | { kind: "loading" }
  | { kind: "render" }
  | { kind: "redirect"; destination: string }
  | { kind: "bootstrap-error" }
  | { kind: "eligibility-review"; message: string }
  | {
      kind: "account-restricted";
      state: PrivateAppBootstrap["accountAccessState"];
    }
  | { kind: "admin-denied" };

export function isAccountControlPath(pathname: string) {
  return (
    pathname === "/settings/account" ||
    pathname.startsWith("/settings/data-privacy") ||
    pathname.startsWith("/settings/connections")
  );
}

export function isAdminPath(pathname: string) {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

export function resolvePrivateRouteGate(input: {
  authLoading: boolean;
  userId: string | null;
  pathname: string;
  adminOnly?: boolean;
  bootstrapStatus: BootstrapStatus;
  bootstrap: PrivateAppBootstrap | null;
}): PrivateRouteGateDecision {
  if (input.authLoading) return { kind: "loading" };
  if (!input.userId) {
    return {
      kind: "redirect",
      destination: `/login?next=${encodeURIComponent(input.pathname)}`,
    };
  }

  const accountControl = isAccountControlPath(input.pathname);
  if (accountControl) return { kind: "render" };

  if (
    input.bootstrapStatus === "idle" ||
    input.bootstrapStatus === "loading"
  ) {
    return { kind: "loading" };
  }
  if (
    input.bootstrapStatus === "error" ||
    !input.bootstrap ||
    input.bootstrap.userId !== input.userId
  ) {
    return { kind: "bootstrap-error" };
  }

  if (input.bootstrap.accountAccessState !== "active") {
    return {
      kind: "account-restricted",
      state: input.bootstrap.accountAccessState,
    };
  }

  const adminOnly = Boolean(input.adminOnly || isAdminPath(input.pathname));
  if (adminOnly) {
    return input.bootstrap.profile?.role === "admin"
      ? { kind: "render" }
      : { kind: "admin-denied" };
  }

  if (!input.bootstrap.hasRequiredConsents) {
    return {
      kind: "redirect",
      destination: `/auth/consent-completion?next=${encodeURIComponent(
        input.pathname,
      )}`,
    };
  }

  if (input.pathname === "/onboarding") {
    if (
      input.bootstrap.onboardingAge !== null &&
      !input.bootstrap.eligibility.eligible
    ) {
      return {
        kind: "eligibility-review",
        message: input.bootstrap.eligibility.message,
      };
    }
    return { kind: "render" };
  }

  if (!input.bootstrap.eligibility.eligible) {
    return {
      kind: "eligibility-review",
      message: input.bootstrap.eligibility.message,
    };
  }

  if (!input.bootstrap.onboardingComplete) {
    return { kind: "redirect", destination: "/onboarding" };
  }

  return { kind: "render" };
}
