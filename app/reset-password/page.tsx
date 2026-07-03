"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toaster";
import { supabase } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [complete, setComplete] = useState(false);
  const { toast } = useToast();
  const valid = password.length >= 8 && /\p{Lu}/u.test(password) && /\p{Ll}/u.test(password) && /[^\p{L}\p{N}\s]/u.test(password) && password === confirmPassword;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || !supabase) return;
    setIsSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setComplete(true);
    } catch (error) {
      toast({ title: "Password update failed", description: error instanceof Error ? error.message : "Please try again.", variant: "error" });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main id="main-content" className="premium-page-bg flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Brand className="mb-6" />
        <Card variant="glassStrong">
          <CardHeader><CardTitle>Choose a new password</CardTitle><CardDescription>Use at least 8 characters with uppercase, lowercase, and a special character.</CardDescription></CardHeader>
          <CardContent>
            {complete ? (
              <div className="space-y-4 text-center"><CheckCircle2 className="mx-auto h-10 w-10 text-success" /><p className="font-semibold">Your password has been updated.</p><Button asChild className="w-full"><Link href="/login">Back to login</Link></Button></div>
            ) : (
              <form className="space-y-4" onSubmit={save}>
                <div className="space-y-2"><Label htmlFor="new-password">New password</Label><Input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></div>
                <div className="space-y-2"><Label htmlFor="confirm-new-password">Confirm password</Label><Input id="confirm-new-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></div>
                <Button type="submit" className="w-full" disabled={!valid || isSaving}>{isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Update password</Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
