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
  const [isLoading, setIsLoading] = useState(false);
  const [resetEmail, setResetEmail] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) return toast({ title: "Email is required", description: "Use the email for your FitLife Hub account." });
    if (password.length < 6) return toast({ title: "Password is too short", description: "Use at least 6 characters." });

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
        toast({ title: "Welcome back to FitLife Hub", description: "Your session is ready." });
        const explicitNext = searchParams.get("next");
        const settings = explicitNext ? null : await getUserAppSettings(data.session.user.id).catch(() => null);
        router.replace(explicitNext ?? defaultStartPageToPath(settings?.defaultStartPage ?? "today"));
        router.refresh();
      } else {
        const { error } = await withAuthTimeout(supabase.auth.signUp({
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
        toast({ title: "FitLife Hub account created", description: "Check your email if confirmation is enabled, then finish onboarding." });
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
    if (!targetEmail.trim()) return toast({ title: "Email is required", description: "Enter your FitLife Hub account email first." });
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
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{mode === "login" ? "Login to FitLife Hub" : "Create your FitLife Hub account"}</CardTitle>
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
                placeholder="Your name, e.g. Ahmed"
                autoComplete="name"
              />
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
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
                placeholder="At least 6 characters"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
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
          <label className="flex min-h-11 items-center gap-3 rounded-md border bg-primary/10 px-3 text-sm">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Remember me / keep me logged in
          </label>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {mode === "login" ? "Login" : "Register"}
          </Button>
        </form>

        {mode === "login" ? (
          <div className="mt-4 rounded-md bg-muted/40 p-3">
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
          {mode === "login" ? "New to FitLife Hub?" : "Already have an account?"}{" "}
          <Link href={mode === "login" ? "/register" : "/login"} className="font-semibold text-primary">
            {mode === "login" ? "Create account" : "Login"}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
