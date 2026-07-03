"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/components/auth/auth-provider";
import { getOnboarding } from "@/services/database/profile";

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

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [isLoading, pathname, router, user]);

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

  if (isLoading || isCheckingSetup) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading Plaivra...</div>;
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
            <Button asChild className="mt-5">
              <Link href="/dashboard">Go to dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return <>{children}</>;
}
