"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SkeletonLine } from "@/components/ui/state-views";
import { useAuth } from "@/components/auth/auth-provider";
import { getOnboarding } from "@/services/database/profile";
import { hasRequiredConsents } from "@/services/database/consents";
import { checkUserLaunchEligibility } from "@/lib/auth/eligibility";
import { supabase } from "@/lib/supabase/client";

function isAccountControlPath(pathname: string) {
  return pathname === "/settings/account"
    || pathname.startsWith("/settings/data-privacy")
    || pathname.startsWith("/settings/connections");
}

export function ProtectedRoute({
  children,
  adminOnly = false
}: {
  children: React.ReactNode;
  adminOnly?: boolean;
}) {
  const { user, isAdmin, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [isCheckingSetup, setIsCheckingSetup] = useState(pathname !== "/onboarding");
  const [isCheckingConsents, setIsCheckingConsents] = useState(false);
  const [isCheckingEligibility, setIsCheckingEligibility] = useState(false);
  const [eligibilityMessage, setEligibilityMessage] = useState("");
  const [verificationError, setVerificationError] = useState("");

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [isLoading, pathname, router, user]);
  useEffect(() => {
    let mounted = true;
    const consentExemptPaths = new Set(["/auth/consent-completion", "/auth/oauth-complete"]);
    if (isLoading || !user?.id || consentExemptPaths.has(pathname) || isAccountControlPath(pathname) || adminOnly) {
      setIsCheckingConsents(false);
      return;
    }
    setIsCheckingConsents(true);
    setVerificationError("");
    hasRequiredConsents(user.id)
      .then((ok) => {
        if (!mounted) return;
        if (!ok) {
          router.replace(`/auth/consent-completion?next=${encodeURIComponent(pathname)}`);
          return;
        }
        setIsCheckingConsents(false);
      })
      .catch((error) => {
        console.warn("Plaivra could not verify consent records.", error);
        if (mounted) {
          setVerificationError("Plaivra could not verify your consent and age eligibility. Retry before opening member features.");
          setIsCheckingConsents(false);
        }
      });
    return () => { mounted = false; };
  }, [adminOnly, isLoading, pathname, router, user?.id]);

  useEffect(() => {
    let mounted = true;
    if (isLoading || !user?.id || user.id === "mock-user" || pathname === "/onboarding" || isAccountControlPath(pathname) || adminOnly) {
      setIsCheckingEligibility(false);
      setEligibilityMessage("");
      return;
    }
    if (!supabase) {
      setVerificationError("Plaivra could not verify age eligibility. Retry before opening member features.");
      return;
    }
    setIsCheckingEligibility(true);
    checkUserLaunchEligibility(supabase, user.id)
      .then((result) => {
        if (!mounted) return;
        setEligibilityMessage(result.eligible ? "" : result.message);
        setIsCheckingEligibility(false);
      })
      .catch((error) => {
        console.warn("Plaivra could not verify launch eligibility.", error);
        if (mounted) {
          setVerificationError("Plaivra could not verify age eligibility. Retry before opening member features.");
          setIsCheckingEligibility(false);
        }
      });
    return () => { mounted = false; };
  }, [adminOnly, isLoading, pathname, user?.id]);


  useEffect(() => {
    let mounted = true;
    if (isLoading || !user?.id || pathname === "/onboarding" || isAccountControlPath(pathname) || adminOnly) {
      setIsCheckingSetup(false);
      return;
    }
    setIsCheckingSetup(true);
    getOnboarding(user.id)
      .then((setup) => {
        if (!mounted) return;
        if (!setup) {
          router.replace("/onboarding");
          return;
        }
        setIsCheckingSetup(false);
      })
      .catch((error) => {
        console.warn("Plaivra could not verify profile setup.", error);
        if (mounted) {
          setVerificationError("Plaivra could not verify your profile setup. Retry before opening member features.");
          setIsCheckingSetup(false);
        }
      });
    return () => { mounted = false; };
  }, [adminOnly, isLoading, pathname, router, user?.id]);

  if (isLoading || isCheckingConsents || isCheckingEligibility || isCheckingSetup) {
    return <PlaivraLoadingState />;
  }

  if (verificationError) {
    return (
      <main className="premium-page-bg flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="space-y-4 pt-6 text-center">
            <ShieldCheck className="mx-auto h-10 w-10 text-warning" />
            <div>
              <h1 className="text-xl font-semibold">Account check unavailable</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{verificationError}</p>
            </div>
            <Button type="button" className="min-h-12 w-full" onClick={() => window.location.reload()}>
              Retry account check
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (!user) return null;

  if (eligibilityMessage) {
    return (
      <main className="premium-page-bg flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="space-y-4 pt-6 text-center">
            <ShieldCheck className="mx-auto h-10 w-10 text-warning" />
            <div>
              <h1 className="text-xl font-semibold">Launch eligibility review required</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{eligibilityMessage}</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Your account is preserved. You can still export or delete your data and revoke ChatGPT access.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button asChild variant="outline" className="min-h-12"><Link href="/settings/data-privacy">Privacy controls</Link></Button>
              <Button asChild className="min-h-12"><Link href="/settings/connections">Revoke connections</Link></Button>
            </div>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (adminOnly && !isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <ShieldCheck className="mx-auto mb-3 h-10 w-10 text-primary" />
            <h1 className="text-xl font-semibold">Admin access only</h1>
            <p className="mt-2 text-sm text-muted-foreground">Your Plaivra account can use the member dashboard.</p>
            <Button asChild className="mt-5 min-h-12">
              <Link href="/dashboard">Go to dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return <>{children}</>;
}

function PlaivraLoadingState() {
  return (
    <main className="premium-page-bg flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-4 pt-6 text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-primary" />
          <div>
            <p className="text-lg font-semibold text-foreground">Loading Plaivra</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Checking your session, consent, and setup before opening the app.</p>
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
