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

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [isLoading, pathname, router, user]);
  useEffect(() => {
    let mounted = true;
    const consentExemptPaths = new Set(["/auth/consent-completion", "/auth/oauth-complete"]);
    if (isLoading || !user?.id || consentExemptPaths.has(pathname) || adminOnly) {
      setIsCheckingConsents(false);
      return;
    }
    setIsCheckingConsents(true);
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
        if (mounted) setIsCheckingConsents(false);
      });
    return () => { mounted = false; };
  }, [adminOnly, isLoading, pathname, router, user?.id]);


  useEffect(() => {
    let mounted = true;
    if (isLoading || !user?.id || pathname === "/onboarding" || adminOnly) {
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
        if (mounted) setIsCheckingSetup(false);
      });
    return () => { mounted = false; };
  }, [adminOnly, isLoading, pathname, router, user?.id]);

  if (isLoading || isCheckingConsents || isCheckingSetup) {
    return <PlaivraLoadingState />;
  }

  if (!user) return null;

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
