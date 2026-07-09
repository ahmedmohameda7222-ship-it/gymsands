"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { CheckCircle2, Eye, EyeOff, Loader2, XCircle } from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineFeedback } from "@/components/motion";
import { supabase } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [complete, setComplete] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "info" | "error"; message: string } | null>(null);
  const passwordRequirements = {
    minLength: password.length >= 8,
    uppercase: /\p{Lu}/u.test(password),
    lowercase: /\p{Ll}/u.test(password),
    special: /[^\p{L}\p{N}\s]/u.test(password)
  };
  const passwordIsValid = Object.values(passwordRequirements).every(Boolean);
  const valid = passwordIsValid && password === confirmPassword;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      setFeedback({ type: "error", message: "Password update is unavailable right now. Please try again later." });
      return;
    }
    if (!valid) {
      setFeedback({ type: "error", message: passwordIsValid ? "Make sure both password fields match." : "Use at least 8 characters with uppercase, lowercase, and a special character." });
      return;
    }

    setIsSaving(true);
    setFeedback(null);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setComplete(true);
      setFeedback({ type: "info", message: "Password updated. You can sign in now." });
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main id="main-content" className="premium-page-bg flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Brand className="mb-6" />
        <Card variant="glassStrong">
          <CardHeader>
            <CardTitle>Choose a new password</CardTitle>
            <CardDescription>Use at least 8 characters with uppercase, lowercase, and a special character.</CardDescription>
          </CardHeader>
          <CardContent>
            {complete ? (
              <div className="space-y-4 text-center">
                <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
                <InlineFeedback message={feedback?.message ?? "Password updated. You can sign in now."} />
                <Button asChild className="min-h-12 w-full"><Link href="/login">Back to login</Link></Button>
              </div>
            ) : (
              <form className="space-y-4" onSubmit={save}>
                <div className="space-y-2">
                  <Label htmlFor="new-password">New password</Label>
                  <div className="relative">
                    <Input
                      id="new-password"
                      type={showPassword ? "text" : "password"}
                      className="h-12 pr-12"
                      autoComplete="new-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-12 w-12"
                      onClick={() => setShowPassword((value) => !value)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <div className="grid gap-1.5 pt-1" aria-live="polite">
                    <PasswordRequirement met={passwordRequirements.minLength} label="Minimum 8 characters" />
                    <PasswordRequirement met={passwordRequirements.uppercase} label="Uppercase letter" />
                    <PasswordRequirement met={passwordRequirements.lowercase} label="Lowercase letter" />
                    <PasswordRequirement met={passwordRequirements.special} label="Special character" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-new-password">Confirm password</Label>
                  <div className="relative">
                    <Input
                      id="confirm-new-password"
                      type={showConfirmPassword ? "text" : "password"}
                      className="h-12 pr-12"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      required
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-12 w-12"
                      onClick={() => setShowConfirmPassword((value) => !value)}
                      aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <InlineFeedback message={feedback?.message} variant={feedback?.type === "error" ? "error" : "info"} onClose={() => setFeedback(null)} />
                <Button type="submit" className="min-h-12 w-full" disabled={!valid || isSaving}>
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Update password
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function PasswordRequirement({ met, label }: { met: boolean; label: string }) {
  const Icon = met ? CheckCircle2 : XCircle;
  return (
    <p className={`flex items-center gap-2 text-xs font-medium ${met ? "text-success" : "text-destructive"}`}>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {label}
    </p>
  );
}
