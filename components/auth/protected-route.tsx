"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { ShieldCheck } from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import { AuthenticatedAppBootReporter } from "@/components/observability/performance-reporter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SkeletonLine } from "@/components/ui/state-views";
import { resolvePrivateRouteGate } from "@/lib/auth/private-route-gate";

export function ProtectedRoute({
  children,
  adminOnly = false,
}: {
  children: React.ReactNode;
  adminOnly?: boolean;
}) {
  const {
    user,
    bootstrap,
    bootstrapStatus,
    bootstrapError,
    isLoading,
    refreshBootstrap,
  } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const decision = useMemo(
    () =>
      resolvePrivateRouteGate({
        authLoading: isLoading,
        userId: user?.id ?? null,
        pathname,
        adminOnly,
        bootstrapStatus,
        bootstrap,
      }),
    [adminOnly, bootstrap, bootstrapStatus, isLoading, pathname, user?.id],
  );

  useEffect(() => {
    if (decision.kind === "redirect") {
      router.replace(decision.destination);
    }
  }, [decision, router]);

  if (decision.kind === "loading" || decision.kind === "redirect") {
    return <PlaivraLoadingState />;
  }

  if (decision.kind === "bootstrap-error") {
    return (
      <AccountCheckUnavailable
        message={
          bootstrapError?.message ||
          "Plaivra could not verify your account. Retry before opening member features."
        }
        onRetry={refreshBootstrap}
      />
    );
  }

  if (decision.kind === "eligibility-review") {
    return <EligibilityReview message={decision.message} />;
  }

  if (decision.kind === "account-restricted") {
    return <RestrictedAccountState state={decision.state} />;
  }

  if (decision.kind === "admin-denied") {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <ShieldCheck className="mx-auto mb-3 h-10 w-10 text-primary" />
            <h1 className="text-xl font-semibold">Admin access only</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Your Plaivra account can use the member dashboard.
            </p>
            <Button asChild className="mt-5 min-h-12">
              <Link href="/dashboard">Go to dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <>
      <AuthenticatedAppBootReporter />
      {children}
    </>
  );
}

function AccountCheckUnavailable({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => Promise<void>;
}) {
  return (
    <main className="premium-page-bg flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-4 pt-6 text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-warning" />
          <div>
            <h1 className="text-xl font-semibold">Account check unavailable</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {message}
            </p>
          </div>
          <Button
            type="button"
            className="min-h-12 w-full"
            onClick={() => void onRetry()}
          >
            Retry account check
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

function EligibilityReview({ message }: { message: string }) {
  return (
    <main className="premium-page-bg flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-4 pt-6 text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-warning" />
          <div>
            <h1 className="text-xl font-semibold">
              Launch eligibility review required
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {message}
            </p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Your account is preserved. You can still export or delete your data
              and revoke ChatGPT access.
            </p>
          </div>
          <AccountControlLinks />
        </CardContent>
      </Card>
    </main>
  );
}

function RestrictedAccountState({ state }: { state: string }) {
  return (
    <main className="premium-page-bg flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-4 pt-6 text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-warning" />
          <div>
            <h1 className="text-xl font-semibold">Account access is limited</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Member features are unavailable while your account access state is
              being handled. Your privacy and connection controls remain
              available.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Account state: {state.replaceAll("_", " ")}
            </p>
          </div>
          <AccountControlLinks />
        </CardContent>
      </Card>
    </main>
  );
}

function AccountControlLinks() {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Button asChild variant="outline" className="min-h-12">
        <Link href="/settings/data-privacy">Privacy controls</Link>
      </Button>
      <Button asChild className="min-h-12">
        <Link href="/settings/connections">Revoke connections</Link>
      </Button>
    </div>
  );
}

function PlaivraLoadingState() {
  return (
    <main className="premium-page-bg flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-4 pt-6 text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-primary" />
          <div>
            <p className="text-lg font-semibold text-foreground">
              Loading Plaivra
            </p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Checking your session, consent, and setup before opening the app.
            </p>
          </div>
          <div className="space-y-2" aria-hidden="true">
            <SkeletonLine className="mx-auto h-3 w-3/4" />
            <SkeletonLine className="mx-auto h-3 w-1/2" />
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
