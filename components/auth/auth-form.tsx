"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Eye, EyeOff, Loader2, XCircle } from "lucide-react";
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
import { useTranslation } from "@/lib/i18n/use-translation";
import { getPublicCopy } from "@/lib/i18n/public-copy";

type RequiredConsentKey = "terms" | "privacy" | "fitnessData" | "disclaimer" | "age16";

const initialRequiredConsents: Record<RequiredConsentKey, boolean> = {
  terms: false,
  privacy: false,
  fitnessData: false,
  disclaimer: false,
  age16: false
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
  const { language } = useTranslation();
  const copy = getPublicCopy(language);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [requiredConsents, setRequiredConsents] = useState(initialRequiredConsents);
  const passwordRequirements = {
    minLength: password.length >= 8,
    uppercase: /\p{Lu}/u.test(password),
    lowercase: /\p{Ll}/u.test(password),
    special: /[^\p{L}\p{N}\s]/u.test(password)
  };
  const passwordIsValid = Object.values(passwordRequirements).every(Boolean);
  const registerIsValid = mode === "login" || (
    passwordIsValid &&
    password === confirmPassword &&
    Object.values(requiredConsents).every(Boolean)
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) return toast({ title: "Email is required", description: "Use the email for your Plaivra account." });
    if (mode === "login" && password.length < 1) {
      return toast({ title: "Password is required", description: "Enter your Plaivra account password." });
    }
    if (mode === "register" && !passwordIsValid) {
      return toast({ title: "Password requirements are not complete", description: "Use at least 8 characters with uppercase, lowercase, and a special character." });
    }
    if (mode === "register" && password !== confirmPassword) {
      return toast({ title: "Passwords do not match", description: "Make sure both password fields match." });
    }
    if (mode === "register" && Object.values(requiredConsents).some((granted) => !granted)) {
      return toast({
        title: "Consent required",
        description: "Accept the Terms, acknowledge the Privacy Policy and health notice, give explicit fitness-data consent, and confirm that you are at least 16."
      });
    }

    setIsLoading(true);
    setRememberSession(remember);

    try {
      if (!supabase) {
        toast({ title: "Welcome", description: "You can continue to the dashboard." });
        router.push(mode === "register" ? "/welcome" : "/dashboard");
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
            emailRedirectTo: `${window.location.origin}/welcome`
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
        router.replace("/welcome");
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

  return (
    <Card className="w-full max-w-md rounded-[24px]">
      <CardHeader>
        <CardTitle>{mode === "login" ? copy.loginTitle : copy.registerTitle}</CardTitle>
        <CardDescription>
          {mode === "login" ? copy.loginDescription : copy.registerDescription}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          {mode === "register" ? (
            <div className="space-y-2">
              <Label htmlFor="full-name">{copy.name}</Label>
              <Input
                id="full-name"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                autoComplete="name"
              />
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="email">{copy.email}</Label>
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
            <Label htmlFor="password">{copy.password}</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
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
            {mode === "register" ? (
              <div className="grid gap-1.5 pt-1" aria-live="polite">
                <PasswordRequirement met={passwordRequirements.minLength} label={copy.minEight} />
                <PasswordRequirement met={passwordRequirements.uppercase} label={copy.uppercase} />
                <PasswordRequirement met={passwordRequirements.lowercase} label={copy.lowercase} />
                <PasswordRequirement met={passwordRequirements.special} label={copy.special} />
              </div>
            ) : null}
          </div>
          {mode === "register" ? (
            <div className="space-y-2">
              <Label htmlFor="confirm-password">{copy.confirmPassword}</Label>
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
            {copy.rememberMe}
          </label>
          {mode === "register" ? (
            <fieldset className="space-y-3 rounded-2xl border border-border/70 p-4">
              <legend className="px-1 text-sm font-semibold">{copy.requiredAgreements}</legend>
              <ConsentCheckbox checked={requiredConsents.terms} onChange={(checked) => setRequiredConsents((current) => ({ ...current, terms: checked }))}>
                {language === "ar" ? "أوافق على " : "I agree to the "}<Link className="font-semibold text-primary underline" href="/legal/terms" target="_blank">{language === "ar" ? "شروط الاستخدام" : "Terms"}</Link>.
              </ConsentCheckbox>
              <ConsentCheckbox checked={requiredConsents.privacy} onChange={(checked) => setRequiredConsents((current) => ({ ...current, privacy: checked }))}>
                {language === "ar" ? "قرأت " : "I have read the "}<Link className="font-semibold text-primary underline" href="/legal/privacy" target="_blank">{language === "ar" ? "سياسة الخصوصية" : "Privacy Policy"}</Link>.
              </ConsentCheckbox>
              <ConsentCheckbox checked={requiredConsents.fitnessData} onChange={(checked) => setRequiredConsents((current) => ({ ...current, fitnessData: checked }))}>
                {language === "ar" ? "أوافق صراحةً على معالجة بيانات اللياقة والتغذية والعافية والجسم والتقدم التي أختار تقديمها لتشغيل الميزات المطلوبة." : "I explicitly consent to Plaivra processing the fitness, nutrition, wellness, body, and progress data I choose to provide for the features I request."}
              </ConsentCheckbox>
              <ConsentCheckbox checked={requiredConsents.disclaimer} onChange={(checked) => setRequiredConsents((current) => ({ ...current, disclaimer: checked }))}>
                {language === "ar" ? "قرأت وفهمت " : "I have read and understood the "}<Link className="font-semibold text-primary underline" href="/legal/disclaimer" target="_blank">{language === "ar" ? "إخلاء المسؤولية الصحية والطبية" : "health and medical disclaimer"}</Link>.
              </ConsentCheckbox>
              <ConsentCheckbox checked={requiredConsents.age16} onChange={(checked) => setRequiredConsents((current) => ({ ...current, age16: checked }))}>
                {language === "ar" ? "أؤكد أن عمري 16 عامًا أو أكثر وأن لدي أي موافقة إضافية مطلوبة قانونًا." : "I confirm I am 16 or older and have any additional guardian consent required by applicable law."}
              </ConsentCheckbox>
            </fieldset>
          ) : null}
          <Button type="submit" className="w-full" disabled={isLoading || !registerIsValid}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {mode === "login" ? copy.login : copy.createAccount}
          </Button>
        </form>
        <p className="mt-5 text-center text-sm text-muted-foreground">
          {mode === "login" ? copy.newToPlaivra : copy.alreadyAccount}{" "}
          <Link href={mode === "login" ? "/register" : "/login"} className="font-semibold text-primary">
            {mode === "login" ? copy.createAccount : copy.login}
          </Link>
          {mode === "login" ? <><span aria-hidden="true"> · </span><Link href="/forgot-password" className="font-semibold text-primary">{copy.forgotPassword}</Link></> : null}
        </p>
      </CardContent>
    </Card>
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
