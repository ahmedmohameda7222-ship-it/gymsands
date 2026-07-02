"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toaster";
import { supabase, setRememberSession } from "@/lib/supabase/client";
import { defaultStartPageToPath, getUserAppSettings } from "@/services/database/user-settings";
import { PENDING_CONSENTS_STORAGE_KEY, REQUIRED_CONSENTS } from "@/lib/legal/versions";
import { safeInternalRedirectPath } from "@/lib/auth/redirect";

type RequiredConsentKey = "terms" | "privacy" | "fitnessData" | "disclaimer" | "age18";

const initialRequiredConsents: Record<RequiredConsentKey, boolean> = {
  terms: false,
  privacy: false,
  fitnessData: false,
  disclaimer: false,
  age18: false
};

async function saveRequiredConsents(accessToken: string) {
  const response = await fetch("/api/user/consents", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ consents: REQUIRED_CONSENTS.map((item) => ({ ...item, granted: true })) })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Consent records could not be saved yet.");
}

async function withAuthTimeout<T>(request: Promise<T>) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("The request took too long. Please try again in a moment.")), 15000);
  });
  try {
    return await Promise.race([request, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [requiredConsents, setRequiredConsents] = useState(initialRequiredConsents);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) return toast({ title: "Email is required", description: "Use the email for your Plaivra account." });
    if (password.length < 6) return toast({ title: "Password is too short", description: "Use at least 6 characters." });
    if (mode === "register" && password !== confirmPassword) {
      return toast({ title: "Passwords do not match", description: "Make sure both password fields match." });
    }
    if (mode === "register" && Object.values(requiredConsents).some((granted) => !granted)) {
      return toast({
        title: "Consent required",
        description: "Review and accept all required terms, privacy, fitness-data, disclaimer, and age confirmations."
      });
    }

    setIsLoading(true);
    setRememberSession(remember);

    try {
      if (!supabase) {
        toast({ title: "Welcome", description: "You can continue to the dashboard." });
        router.push("/dashboard");
        return;
      }

      if (mode === "login") {
        const { data, error } = await withAuthTimeout(supabase.auth.signInWithPassword({ email, password }));
        if (error) throw error;
        if (!data.session) throw new Error("Login could not finish. Please try again.");
        if (window.localStorage.getItem(PENDING_CONSENTS_STORAGE_KEY)) {
          try {
            await saveRequiredConsents(data.session.access_token);
            window.localStorage.removeItem(PENDING_CONSENTS_STORAGE_KEY);
          } catch (consentError) {
            console.warn("Plaivra will retry saving required consent records later:", consentError);
          }
        }
        toast({ title: "Welcome back to Plaivra", description: "Your session is ready." });
        const explicitNext = searchParams.get("next");
        const settings = explicitNext ? null : await getUserAppSettings(data.session.user.id).catch(() => null);
        router.replace(explicitNext
          ? safeInternalRedirectPath(explicitNext)
          : defaultStartPageToPath(settings?.defaultStartPage ?? "today"));
        router.refresh();
      } else {
        const { data, error } = await withAuthTimeout(supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName
            },
            emailRedirectTo: `${window.location.origin}/onboarding`
          }
        }));
        if (error) throw error;
        let consentSaved = false;
        if (data.session?.access_token) {
          try {
            await saveRequiredConsents(data.session.access_token);
            consentSaved = true;
            window.localStorage.removeItem(PENDING_CONSENTS_STORAGE_KEY);
          } catch (consentError) {
            console.warn("Consent persistence will be retried after sign-in:", consentError);
          }
        }
        if (!consentSaved) {
          window.localStorage.setItem(PENDING_CONSENTS_STORAGE_KEY, JSON.stringify(REQUIRED_CONSENTS));
        }
        toast({
          title: "Plaivra account created",
          description: consentSaved
            ? "Your consent choices were recorded. Finish onboarding next."
            : "Check your email if confirmation is enabled. Plaivra will save your consent record after sign-in."
        });
        router.replace("/onboarding");
        router.refresh();
      }
    } catch (error) {
      toast({
        title: mode === "login" ? "Login failed" : "Registration failed",
        description: error instanceof Error ? error.message : "Please try again."
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function handlePasswordReset() {
    const targetEmail = resetEmail || email;
    if (!targetEmail.trim()) return toast({ title: "Email is required", description: "Enter your Plaivra account email first." });
    if (!supabase) return toast({ title: "Password reset unavailable", description: "Please try again later." });
    const { error } = await supabase.auth.resetPasswordForEmail(targetEmail, {
      redirectTo: `${window.location.origin}/profile`
    });
    if (error) {
      toast({ title: "Reset email failed", description: error.message });
    } else {
      toast({ title: "Password reset email sent", description: "Open your email to continue." });
    }
  }

  return (
    <Card className="w-full max-w-md rounded-[24px]">
      <CardHeader>
        <CardTitle>{mode === "login" ? "Login to Plaivra" : "Create your Plaivra account"}</CardTitle>
        <CardDescription>
          {mode === "login" ? "Continue to your private fitness dashboard." : "Start with a quick, simple onboarding."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          {mode === "register" ? (
            <div className="space-y-2">
              <Label htmlFor="full-name">Full name</Label>
              <Input
                id="full-name"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Your name"
                autoComplete="name"
              />
            </div>
          ) : null}
          {mode === "register" ? (
            <fieldset className="space-y-3 rounded-2xl border border-border/70 p-4">
              <legend className="px-1 text-sm font-semibold">Required agreements</legend>
              <ConsentCheckbox
                checked={requiredConsents.terms}
                onChange={(checked) => setRequiredConsents((current) => ({ ...current, terms: checked }))}
              >
                I agree to the <Link className="font-semibold text-primary underline" href="/legal/terms" target="_blank">Terms</Link>.
              </ConsentCheckbox>
              <ConsentCheckbox
                checked={requiredConsents.privacy}
                onChange={(checked) => setRequiredConsents((current) => ({ ...current, privacy: checked }))}
              >
                I have read the <Link className="font-semibold text-primary underline" href="/legal/privacy" target="_blank">Privacy Policy</Link>.
              </ConsentCheckbox>
              <ConsentCheckbox
                checked={requiredConsents.fitnessData}
                onChange={(checked) => setRequiredConsents((current) => ({ ...current, fitnessData: checked }))}
              >
                I understand Plaivra processes fitness, wellness, body and progress data.
              </ConsentCheckbox>
              <ConsentCheckbox
                checked={requiredConsents.disclaimer}
                onChange={(checked) => setRequiredConsents((current) => ({ ...current, disclaimer: checked }))}
              >
                I understand Plaivra is not medical advice.
              </ConsentCheckbox>
              <ConsentCheckbox
                checked={requiredConsents.age18}
                onChange={(checked) => setRequiredConsents((current) => ({ ...current, age18: checked }))}
              >
                I confirm I am 18 or older.
              </ConsentCheckbox>
            </fieldset>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={mode === "register" ? "you@example.com" : undefined}
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                placeholder={mode === "register" ? "At least 6 characters" : undefined}
                required
                className="pr-12"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-11"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          {mode === "register" ? (
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm password</Label>
              <div className="relative">
                <Input
                  id="confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  required
                  className="pr-12"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-11"
                  onClick={() => setShowConfirmPassword((value) => !value)}
                  aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          ) : null}
          <label className="solid-row flex min-h-11 items-center gap-3 px-3 text-sm">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
              className="h-4 w-4 rounded border-border accent-primary"
            />
            Remember me / keep me logged in
          </label>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {mode === "login" ? "Login" : "Register"}
          </Button>
        </form>

        {mode === "login" ? (
          <div className="solid-row mt-4 p-3">
            <Label htmlFor="reset-email" className="text-xs">
              Password reset
            </Label>
            <div className="mt-2 flex gap-2">
              <Input
                id="reset-email"
                type="email"
                value={resetEmail}
                onChange={(event) => setResetEmail(event.target.value)}
                placeholder="Email for reset link"
              />
              <Button type="button" variant="outline" onClick={handlePasswordReset}>
                Send
              </Button>
            </div>
          </div>
        ) : null}

        <p className="mt-5 text-center text-sm text-muted-foreground">
          {mode === "login" ? "New to Plaivra?" : "Already have an account?"}{" "}
          <Link href={mode === "login" ? "/register" : "/login"} className="font-semibold text-primary">
            {mode === "login" ? "Create account" : "Login"}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

function ConsentCheckbox({
  checked,
  onChange,
  children
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-start gap-3 text-sm leading-5 text-muted-foreground">
      <input
        type="checkbox"
        required
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-primary"
      />
      <span>{children}</span>
    </label>
  );
}
