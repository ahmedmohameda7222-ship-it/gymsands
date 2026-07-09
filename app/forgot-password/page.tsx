"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { Loader2, Mail } from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toaster";
import { InlineFeedback } from "@/components/motion";
import { getPublicCopy } from "@/lib/i18n/public-copy";
import { useTranslation } from "@/lib/i18n/use-translation";
import { supabase } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "info" | "error"; message: string } | null>(null);
  const { toast } = useToast();
  const { language } = useTranslation();
  const copy = getPublicCopy(language);

  async function sendReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) return;
    if (!supabase) {
      setFeedback({ type: "error", message: "Password reset is unavailable right now. Please try again later." });
      toast({ title: "Password reset unavailable", description: "Please try again later.", variant: "error" });
      return;
    }
    setIsSending(true);
    setFeedback(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`
      });
      if (error) throw error;
      setFeedback({ type: "info", message: language === "ar" ? "تم إرسال رابط الاستعادة. تحقق من بريدك الإلكتروني." : "Reset link sent. Check your email." });
      toast({
        title: language === "ar" ? "تم إرسال رابط الاستعادة" : "Reset link sent",
        description: language === "ar" ? "افتح بريدك الإلكتروني للمتابعة." : "Open your email to continue."
      });
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Please try again." });
      toast({ title: language === "ar" ? "تعذر إرسال الرابط" : "Could not send reset link", description: error instanceof Error ? error.message : "Please try again.", variant: "error" });
    } finally {
      setIsSending(false);
    }
  }

  return (
    <main id="main-content" className="premium-page-bg relative flex min-h-screen items-center justify-center px-4 py-24">
      <LanguageSwitcher className="absolute end-4 top-4 sm:end-6 sm:top-6" />
      <div className="w-full max-w-md">
        <Brand className="mb-6" />
        <Card variant="glassStrong">
          <CardHeader>
            <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Mail className="h-5 w-5" /></div>
            <CardTitle>{copy.forgotTitle}</CardTitle>
            <CardDescription>{copy.forgotDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={sendReset}>
              <div className="space-y-2">
                <Label htmlFor="forgot-email">{copy.email}</Label>
                <Input id="forgot-email" className="h-12" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
              </div>
              <InlineFeedback message={feedback?.message} variant={feedback?.type === "error" ? "error" : "info"} onClose={() => setFeedback(null)} />
              <Button type="submit" className="min-h-12 w-full" disabled={isSending || !email.trim()}>
                {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {copy.sendResetLink}
              </Button>
            </form>
            <p className="mt-5 text-center text-sm"><Link href="/login" className="inline-flex min-h-12 items-center font-semibold text-primary">{copy.backToLogin}</Link></p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
