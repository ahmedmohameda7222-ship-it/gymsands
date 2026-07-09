"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { hasRequiredConsents } from "@/services/database/consents";
import { PENDING_CONSENTS_STORAGE_KEY, REQUIRED_CONSENTS } from "@/lib/legal/versions";
import { safeInternalRedirectPath } from "@/lib/auth/redirect";

const OAUTH_MODE_KEY = "plaivra.oauth.mode";
const OAUTH_NEXT_KEY = "plaivra.oauth.next";

async function savePendingConsents(accessToken: string) {
  const pending = window.localStorage.getItem(PENDING_CONSENTS_STORAGE_KEY);
  if (!pending) return { saved: true };

  const response = await fetch("/api/user/consents", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      consents: REQUIRED_CONSENTS.map((item) => ({ ...item, granted: true }))
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Consent records could not be saved yet.");
  return { saved: true };
}

export function OAuthCompleteClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    async function handleOAuthReturn() {
      try {
        if (!supabase) {
          if (mounted) {
            setStatus("error");
            setErrorMessage("Authentication is not available right now.");
          }
          return;
        }

        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !sessionData.session) {
          if (mounted) {
            router.replace("/login");
          }
          return;
        }

        const session = sessionData.session;
        const mode = window.localStorage.getItem(OAUTH_MODE_KEY) as "login" | "register" | null;
        const storedNext = window.localStorage.getItem(OAUTH_NEXT_KEY);
        const explicitNext = searchParams.get("next");
        const safeNext = safeInternalRedirectPath(explicitNext ?? storedNext ?? undefined);

        // Always clean up mode/next keys regardless of outcome
        window.localStorage.removeItem(OAUTH_MODE_KEY);
        window.localStorage.removeItem(OAUTH_NEXT_KEY);

        const pendingExists = Boolean(window.localStorage.getItem(PENDING_CONSENTS_STORAGE_KEY));

        // Register mode: pending consents must exist; try to save them
        if (mode === "register" && pendingExists) {
          try {
            await savePendingConsents(session.access_token);
            window.localStorage.removeItem(PENDING_CONSENTS_STORAGE_KEY);
          } catch (saveError) {
            console.warn("Plaivra consent save failed after Google OAuth:", saveError);
            // Keep pending consents in localStorage for retry
            if (mounted) {
              setStatus("error");
              setErrorMessage(
                errorMessageFrom(saveError) ??
                  "We could not save your required agreements. Please try again."
              );
            }
            return;
          }
        }

        // For both modes, verify consents are present (handles new users from login flow too)
        const consentsOk = await hasRequiredConsents(session.user.id);
        if (!consentsOk) {
          if (mounted) {
            router.replace(`/auth/consent-completion?next=${encodeURIComponent(safeNext)}`);
          }
          return;
        }

        // All clear
        if (mounted) {
          if (mode === "register") {
            router.replace("/welcome");
          } else {
            router.replace(safeNext);
          }
        }
      } catch (err) {
        console.error("Plaivra OAuth completion error:", err);
        if (mounted) {
          setStatus("error");
          setErrorMessage(
            errorMessageFrom(err) ??
              "Something went wrong finishing sign-in. Please try again."
          );
        }
      }
    }

    handleOAuthReturn();

    return () => {
      mounted = false;
    };
  }, [router, searchParams]);

  function handleRetry() {
    setStatus("loading");
    setErrorMessage("");
    window.location.reload();
  }

  if (status === "error") {
    return (
      <main className="premium-page-bg flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md rounded-[24px] bg-card p-8 text-center shadow-luxe">
          <h1 className="text-xl font-semibold">Sign-in incomplete</h1>
          <p className="mt-2 text-sm text-muted-foreground">{errorMessage}</p>
          <button
            onClick={handleRetry}
            className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/login"
            className="mt-3 inline-flex min-h-12 w-full items-center justify-center text-sm font-semibold text-primary underline"
          >
            Back to login
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="premium-page-bg flex min-h-screen items-center justify-center px-4">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="text-sm">Finishing sign-in...</p>
      </div>
    </main>
  );
}

function errorMessageFrom(err: unknown): string | undefined {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return undefined;
}
