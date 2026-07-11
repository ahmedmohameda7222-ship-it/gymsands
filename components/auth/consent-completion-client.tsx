"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InlineFeedback } from "@/components/motion";
import { useToast } from "@/components/ui/toaster";
import { useAuth } from "@/components/auth/auth-provider";
import { PENDING_CONSENTS_STORAGE_KEY, REQUIRED_CONSENTS } from "@/lib/legal/versions";
import { safeInternalRedirectPath } from "@/lib/auth/redirect";
import { useTranslation } from "@/lib/i18n/use-translation";
import { getPublicCopy } from "@/lib/i18n/public-copy";
import { hasRequiredConsents } from "@/services/database/consents";
import {
  MAXIMUM_PROFILE_AGE,
  MINIMUM_LAUNCH_AGE,
  PENDING_ELIGIBILITY_STORAGE_KEY,
  launchAgeSchema
} from "@/lib/auth/eligibility";

type RequiredConsentKey = "terms" | "privacy" | "fitnessData" | "disclaimer" | "age16";

const initialRequiredConsents: Record<RequiredConsentKey, boolean> = {
  terms: false,
  privacy: false,
  fitnessData: false,
  disclaimer: false,
  age16: false
};

async function saveRequiredConsents(accessToken: string, declaredAge: number) {
  const response = await fetch("/api/user/consents", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      declared_age: declaredAge,
      consents: REQUIRED_CONSENTS.map((item) => ({ ...item, granted: true }))
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Consent records could not be saved yet.");
}

export function ConsentCompletionClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { user, session, isLoading: authLoading } = useAuth();
  const { language } = useTranslation();
  const copy = getPublicCopy(language);

  const [requiredConsents, setRequiredConsents] = useState(initialRequiredConsents);
  const [declaredAge, setDeclaredAge] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [saveError, setSaveError] = useState("");

  const ageResult = launchAgeSchema.safeParse(declaredAge === "" ? "" : Number(declaredAge));
  const allChecked = Object.values(requiredConsents).every(Boolean) && ageResult.success;
  const next = safeInternalRedirectPath(searchParams.get("next") ?? undefined);

  useEffect(() => {
    const pendingAge = window.localStorage.getItem(PENDING_ELIGIBILITY_STORAGE_KEY);
    if (pendingAge) setDeclaredAge(pendingAge);
  }, []);

  // If already authenticated and has consents, redirect away
  useEffect(() => {
    let mounted = true;

    async function verify() {
      if (authLoading) return;
      if (!user?.id) {
        if (mounted) {
          setIsChecking(false);
          router.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
        }
        return;
      }

      const ok = await hasRequiredConsents(user.id);
      if (ok) {
        if (mounted) router.replace(next);
        return;
      }

      if (mounted) setIsChecking(false);
    }

    verify();
    return () => { mounted = false; };
  }, [authLoading, user, router, next]);

  async function handleSubmit() {
    if (!ageResult.success) {
      setSaveError(ageResult.message);
      return;
    }
    if (!allChecked) {
      setSaveError("Please accept all required agreements to continue.");
      toast({
        title: language === "ar" ? "الموافقات المطلوبة" : "Consent required",
        description:
          language === "ar"
            ? "يرجى قبول جميع الاتفاقيات المطلوبة للمتابعة."
            : "Please accept all required agreements to continue."
      });
      return;
    }

    if (!session?.access_token) {
      setSaveError("Please sign in again.");
      toast({
        title: language === "ar" ? "انتهت الجلسة" : "Session expired",
        description:
          language === "ar"
            ? "يرجى تسجيل الدخول مرة أخرى."
            : "Please sign in again."
      });
      return;
    }

    setIsSaving(true);
    setSaveError("");
    try {
      await saveRequiredConsents(session.access_token, ageResult.data);
      window.localStorage.removeItem(PENDING_CONSENTS_STORAGE_KEY);
      window.localStorage.removeItem(PENDING_ELIGIBILITY_STORAGE_KEY);
      toast({
        title: language === "ar" ? "تم الحفظ" : "Saved",
        description:
          language === "ar"
            ? "تم تسجيل موافقاتك. يمكنك الآن المتابعة."
            : "Your agreements were recorded. You can continue now."
      });
      router.replace(next);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      toast({
        title: language === "ar" ? "فشل الحفظ" : "Save failed",
        description:
          err instanceof Error
            ? err.message
            : language === "ar"
              ? "حدث خطأ. يرجى المحاولة مرة أخرى."
              : "Something went wrong. Please try again."
      });
    } finally {
      setIsSaving(false);
    }
  }

  if (isChecking || authLoading) {
    return (
      <main className="premium-page-bg flex min-h-screen items-center justify-center px-4">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <p className="text-sm">Loading...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="premium-page-bg flex min-h-screen items-center justify-center px-4 pb-8 pt-24">
      <Card className="w-full max-w-md rounded-[24px]">
        <CardHeader>
          <CardTitle>
            {language === "ar" ? "أكمل موافقاتك" : "Complete your agreements"}
          </CardTitle>
          <CardDescription>
            {language === "ar"
              ? "قبل المتابعة إلى Plaivra، يُرجى مراجعة الموافقات المطلوبة أدناه."
              : "Before continuing to Plaivra, please review the required agreements below."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="consent-age">Age</Label>
            <Input
              id="consent-age"
              type="number"
              inputMode="numeric"
              min={MINIMUM_LAUNCH_AGE}
              max={MAXIMUM_PROFILE_AGE}
              step={1}
              className="h-12"
              value={declaredAge}
              onChange={(event) => setDeclaredAge(event.target.value)}
              required
              aria-describedby="consent-age-help"
            />
            <p id="consent-age-help" className="text-xs leading-5 text-muted-foreground">
              Plaivra is available to people age {MINIMUM_LAUNCH_AGE} or older for the initial launch.
            </p>
          </div>
          <fieldset className="space-y-3 rounded-2xl border border-border/70 p-4">
            <legend className="px-1 text-sm font-semibold">{copy.requiredAgreements}</legend>
            <ConsentCheckbox
              checked={requiredConsents.terms}
              onChange={(checked) => setRequiredConsents((c) => ({ ...c, terms: checked }))}
            >
              {language === "ar" ? "أوافق على " : "I agree to the "}
              <Link className="font-semibold text-primary underline" href="/legal/terms" target="_blank">
                {language === "ar" ? "شروط الاستخدام" : "Terms"}
              </Link>
              .
            </ConsentCheckbox>
            <ConsentCheckbox
              checked={requiredConsents.privacy}
              onChange={(checked) => setRequiredConsents((c) => ({ ...c, privacy: checked }))}
            >
              {language === "ar" ? "قرأت " : "I have read the "}
              <Link className="font-semibold text-primary underline" href="/legal/privacy" target="_blank">
                {language === "ar" ? "سياسة الخصوصية" : "Privacy Policy"}
              </Link>
              .
            </ConsentCheckbox>
            <ConsentCheckbox
              checked={requiredConsents.fitnessData}
              onChange={(checked) => setRequiredConsents((c) => ({ ...c, fitnessData: checked }))}
            >
              {language === "ar"
                ? "أوافق صراحةً على معالجة بيانات اللياقة والتغذية والعافية والجسم والتقدم التي أختار تقديمها لتشغيل الميزات المطلوبة."
                : "I explicitly consent to Plaivra processing the fitness, nutrition, wellness, body, and progress data I choose to provide for the features I request."}
            </ConsentCheckbox>
            <ConsentCheckbox
              checked={requiredConsents.disclaimer}
              onChange={(checked) => setRequiredConsents((c) => ({ ...c, disclaimer: checked }))}
            >
              {language === "ar" ? "قرأت وفهمت " : "I have read and understood the "}
              <Link className="font-semibold text-primary underline" href="/legal/disclaimer" target="_blank">
                {language === "ar" ? "إخلاء المسؤولية الصحية والطبية" : "health and medical disclaimer"}
              </Link>
              .
            </ConsentCheckbox>
            <ConsentCheckbox
              checked={requiredConsents.age16}
              onChange={(checked) => setRequiredConsents((c) => ({ ...c, age16: checked }))}
            >
              {language === "ar"
                ? "أؤكد أن عمري 16 عامًا أو أكثر وأن لدي أي موافقة إضافية مطلوبة قانونًا."
                : "I confirm I am 16 or older and have any additional guardian consent required by applicable law."}
            </ConsentCheckbox>
          </fieldset>

          <InlineFeedback message={saveError} variant="error" onClose={() => setSaveError("")} />

          <Button className="min-h-12 w-full" disabled={isSaving || !allChecked} onClick={handleSubmit}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {language === "ar" ? "متابعة" : "Continue"}
          </Button>
        </CardContent>
      </Card>
    </main>
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
    <label className="flex min-h-12 items-start gap-3 rounded-xl px-1 py-2 text-sm leading-5 text-muted-foreground">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 rounded border-border accent-primary"
      />
      <span>{children}</span>
    </label>
  );
}
