"use client";

import Image from "next/image";
import Link from "next/link";
import {
  BarChart3,
  FileCheck2,
  LockKeyhole,
  MessageSquareText,
  Monitor,
  ShieldCheck,
  Sparkles,
  TimerReset
} from "lucide-react";
import { PublicNav } from "@/components/layout/public-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PublicFooter } from "@/components/layout/public-footer";
import { useTranslation } from "@/lib/i18n/use-translation";
import { getPublicCopy } from "@/lib/i18n/public-copy";

const englishFeatures = [
  { icon: LockKeyhole, title: "Connect with limited access", text: "Choose the Plaivra areas ChatGPT may read or change, then narrow or revoke access whenever you want." },
  { icon: MessageSquareText, title: "Ask ChatGPT naturally", text: "ChatGPT reads only the authorized context needed for your workout, nutrition, progress, or daily-execution task." },
  { icon: BarChart3, title: "Track the saved result", text: "Authorized Plaivra tools store successful changes directly, with stable history and clear status." },
  { icon: ShieldCheck, title: "Edit and correct anytime", text: "Direct Plaivra controls remain available for execution, fallback, correction, and privacy." }
];

const arabicFeatures = [
  { icon: LockKeyhole, title: "اتصل بصلاحيات محدودة", text: "اختر أقسام Plaivra التي يمكن لـ ChatGPT قراءتها أو تغييرها، ويمكنك تضييق الوصول أو إلغاؤه في أي وقت." },
  { icon: MessageSquareText, title: "اطلب من ChatGPT بطريقتك", text: "يقرأ ChatGPT فقط السياق المصرح به والضروري للمهمة التي طلبتها." },
  { icon: BarChart3, title: "تابع النتيجة المحفوظة", text: "تحفظ أدوات Plaivra المصرح بها التغييرات الناجحة مباشرة مع سجل واضح للحالة." },
  { icon: ShieldCheck, title: "عدّل وصحّح في أي وقت", text: "تبقى أدوات Plaivra المباشرة متاحة للتنفيذ والتصحيح والخصوصية." }
];

const workflowSteps = [
  { icon: LockKeyhole, enLabel: "Connect Plaivra", enDetail: "Task-specific permissions", arLabel: "اربط Plaivra", arDetail: "صلاحيات خاصة بالمهمة" },
  { icon: MessageSquareText, enLabel: "Ask ChatGPT", enDetail: "Minimum relevant context", arLabel: "اسأل ChatGPT", arDetail: "أقل قدر لازم من السياق" },
  { icon: BarChart3, enLabel: "Plaivra tracks", enDetail: "Saved tools, visuals, control", arLabel: "يتابع Plaivra", arDetail: "حفظ وعرض وتحكم مباشر" }
];

const productSurfaces = [
  { enLabel: "Today", enDetail: "The next useful workout, nutrition, and daily-execution actions.", arLabel: "اليوم", arDetail: "الخطوات المفيدة التالية للتمرين والتغذية والتنفيذ اليومي." },
  { enLabel: "Train", enDetail: "Plans, active sessions, history, and direct corrections.", arLabel: "التمرين", arDetail: "الخطط والجلسات النشطة والسجل والتصحيح المباشر." },
  { enLabel: "Eat", enDetail: "Food logging, meal planning, groceries, and nutrition progress.", arLabel: "التغذية", arDetail: "تسجيل الطعام وخطط الوجبات والمشتريات وتقدم التغذية." },
  { enLabel: "Progress", enDetail: "Accessible charts, measurements, records, and trends.", arLabel: "التقدم", arDetail: "رسوم ميسّرة وقياسات وأرقام قياسية واتجاهات." },
  { enLabel: "Settings", enDetail: "Connections, permissions, privacy, export, and deletion.", arLabel: "الإعدادات", arDetail: "الاتصالات والصلاحيات والخصوصية والتصدير والحذف." }
] as const;

const trustLinks = [
  { href: "/legal/privacy", enLabel: "Privacy", enText: "User controls data", arLabel: "الخصوصية", arText: "المستخدم يتحكم ببياناته" },
  { href: "/legal/disclaimer", enLabel: "Health disclaimer", enText: "Not medical advice", arLabel: "إخلاء المسؤولية الصحية", arText: "ليست نصيحة طبية" },
  { href: "/legal/terms", enLabel: "Terms", enText: "Consent first", arLabel: "الشروط", arText: "الموافقة أولًا" }
];

export default function LandingPage() {
  const { language } = useTranslation();
  const copy = getPublicCopy(language);
  const isArabic = language === "ar";
  const features = isArabic ? arabicFeatures : englishFeatures;
  const chips = isArabic
    ? ["صلاحيات محدودة", "تنفيذ منظم بالأدوات", "تصحيحات مباشرة", "تحكم بالخصوصية"]
    : ["Limited permissions", "Structured tool execution", "Direct corrections", "Privacy controls"];
  const text = isArabic ? {
    flow: "اربط Plaivra ← اختر صلاحيات محدودة ← اسأل ChatGPT ← تابع النتيجة المؤكدة بالأداة.",
    confirmation: "تبقى أدوات التنفيذ والتصحيح المباشر متاحة. وتتطلب الإجراءات المؤثرة أو المدمرة تأكيدًا صريحًا.",
    productMap: "خريطة المنتج",
    domainsTitle: "خمسة مجالات وسجل واحد متصل",
    capabilityNotice: "هذه خريطة للقدرات وليست بيانات مستخدم نموذجية. صورة التسجيل الحقيقية أدناه من إصدار إنتاج محلي؛ وتبقى صور بيانات العضو معلقة حتى إصدار متحقق منه بحساب تجريبي مصطنع.",
    workflowLabel: "سير عمل Plaivra",
    scopedTitle: "وصول محدود",
    scopedText: "لا يمكن لـ ChatGPT استخدام سوى أقسام Plaivra والإجراءات التي تسمح بها، مع تطبيق الصلاحيات على الخادم.",
    controlTitle: "المستخدم يتحكم بالبيانات",
    controlText: "يمكن الاطلاع على الخصوصية والشروط وإخلاء المسؤولية الصحية والموافقات قبل إنشاء الحساب.",
    correctionTitle: "يبقى التصحيح اليدوي",
    correctionText: "يبقى الإدخال المباشر متاحًا كخيار احتياطي وللتصحيح والتكرار والتحكم المتقدم.",
    screenshotLabel: "واجهة حقيقية",
    screenshotTitle: "الموافقة والخصوصية قبل التتبع",
    screenshotText: "هذه شاشة إنشاء الحساب الفعلية في Plaivra. توضح العمر المطلوب والموافقات والخصوصية قبل إدخال أي سياق للياقة.",
    screenshotCaption: "صورة من إصدار Plaivra المحلي للإنتاج بتاريخ 11 يوليو 2026. لا تحتوي على بيانات مستخدم أو مراجعات أو نتائج مصطنعة.",
    faq: "الأسئلة الشائعة",
    faqTitle: "قبل إنشاء الحساب",
    ageQuestion: "ما العمر المطلوب؟",
    ageAnswer: "يتوفر Plaivra لمن يبلغ 16 عامًا أو أكثر عند الإطلاق الأول. تُراجع الحسابات الحالية ذات بيانات العمر الناقصة أو المتعارضة من دون حذف صامت.",
    profileQuestion: "هل يستلم ChatGPT ملفي الكامل؟",
    profileAnswer: "لا. يشارك Plaivra فقط السياق الخاص بالمهمة الذي تغطيه الصلاحيات التي منحتها.",
    correctionQuestion: "هل يمكنني تصحيح نتيجة محفوظة؟",
    correctionAnswer: "نعم. تستخدم الخطط والسجلات المنشأة بالأدوات شاشات Plaivra المعتادة مع تحكم مباشر بالتعديل والتصحيح والتصدير والحذف.",
    availability: "توفر المنصات",
    availabilityTitle: "حالة إطلاق واضحة",
    availabilityText: "تطبيق Plaivra على الويب هو واجهة الإطلاق. يعتمد توفر اتصال ChatGPT على اكتمال مراجعة المنصة. تطبيقات iOS وAndroid مخطط لها وليست متاحة حاليًا.",
    web: "تطبيق الويب",
    webStatus: "واجهة الإطلاق العام الأولى",
    futurePlatforms: "ChatGPT وiOS وAndroid",
    futureStatus: "تتطلب مراجعة أو تسليمًا لاحقًا",
    ctaTitle: "ابدأ بالموافقة ثم الإعداد",
    ctaText: "أنشئ حسابًا وأكمل الإعداد الأساسي واربط Plaivra بـ ChatGPT واختر صلاحيات مهمتك الأولى."
  } : {
    flow: "Connect Plaivra -> choose limited permissions -> ask ChatGPT -> track the tool-confirmed result.",
    confirmation: "Manual execution and correction controls stay available. Consequential or destructive actions still require explicit confirmation.",
    productMap: "Product map",
    domainsTitle: "Five domains, one continuous record",
    capabilityNotice: "This is a capability map, not sample user data. The real registration screen below comes from a local production build; member-data screenshots remain gated on a verified release and synthetic reviewer account.",
    workflowLabel: "Plaivra workflow",
    scopedTitle: "Scoped access",
    scopedText: "ChatGPT can use only the Plaivra areas and actions you permit, with server-side enforcement.",
    controlTitle: "User controls data",
    controlText: "Privacy, legal, health disclaimer, and consent are accessible before account creation.",
    correctionTitle: "Manual correction stays",
    correctionText: "Manual entry remains available for fallback, correction, repeat, and advanced control.",
    screenshotLabel: "Real product surface",
    screenshotTitle: "Consent and privacy before tracking",
    screenshotText: "This is Plaivra's implemented account-creation screen. It makes age eligibility, required agreements, and privacy visible before any fitness context is entered.",
    screenshotCaption: "Captured from the local production Plaivra build on July 11, 2026. It contains no member data, reviews, or fabricated results.",
    faq: "FAQ",
    faqTitle: "Before you create an account",
    ageQuestion: "How old do I need to be?",
    ageAnswer: "Plaivra is available to people age 16 or older for the initial launch. Existing accounts with missing or conflicting age information are reviewed without silent deletion.",
    profileQuestion: "Does ChatGPT receive my full profile?",
    profileAnswer: "No. Plaivra shares only the task-specific context covered by the permissions you granted.",
    correctionQuestion: "Can I correct a saved result?",
    correctionAnswer: "Yes. Tool-created plans and logs use normal Plaivra screens with direct edit, correction, export, and deletion controls.",
    availability: "Platform availability",
    availabilityTitle: "Truthful launch status",
    availabilityText: "Plaivra's web app is the launch surface. ChatGPT connection availability depends on completed platform review. Native iOS and Android apps are planned, not currently available.",
    web: "Web app",
    webStatus: "Initial public launch surface",
    futurePlatforms: "ChatGPT, iOS, Android",
    futureStatus: "Review or future delivery required",
    ctaTitle: "Start with consent, then onboarding",
    ctaText: "Create an account, complete essential setup, connect Plaivra to ChatGPT, and choose permissions for your first task."
  };

  return (
    <div className="premium-page-bg min-h-screen text-foreground">
      <PublicNav />
      <main>
        <section className="relative overflow-hidden border-b border-border/60">
          <div className="container grid min-h-[calc(100vh-4rem)] gap-10 pb-10 pt-10 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
            <div className="max-w-3xl">
              <p className="inline-flex min-h-10 items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 text-sm font-semibold text-primary">
                <Sparkles className="h-4 w-4" />
                {copy.landingMotto}
              </p>
              <h1 className="mt-5 text-5xl font-bold tracking-normal sm:text-7xl">Plaivra</h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">{copy.landingBody}</p>
              <div className="mt-6 grid gap-2 border-l-2 border-primary/40 pl-4 text-sm leading-6 text-muted-foreground">
                <p className="font-semibold text-foreground">{text.flow}</p>
                <p>{text.confirmation}</p>
              </div>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg">
                  <Link href="/register">{copy.createAccount}</Link>
                </Button>
                <Button asChild variant="outline" size="lg" className="border-primary/60 bg-[color-mix(in_srgb,var(--surface)_55%,transparent)] text-foreground hover:bg-[color-mix(in_srgb,var(--surface)_75%,transparent)]">
                  <Link href="/login">{copy.login}</Link>
                </Button>
              </div>
              <div className="mt-8 flex flex-wrap gap-2">
                {chips.map((item) => (
                  <span key={item} className="glass-chip min-h-10 px-3 py-2 text-sm">
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <div className="space-y-5 rounded-[28px] bg-[color-mix(in_srgb,var(--surface)_72%,transparent)] p-4 shadow-soft sm:p-6">
              <div className="grid gap-3 sm:grid-cols-3" aria-label={text.workflowLabel}>
                {workflowSteps.map((step, index) => {
                  const Icon = step.icon;
                  const label = isArabic ? step.arLabel : step.enLabel;
                  const detail = isArabic ? step.arDetail : step.enDetail;
                  return (
                    <div key={step.enLabel} className="rounded-[18px] bg-background/80 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <Icon className="h-5 w-5 text-primary" />
                        <span className="text-xs font-semibold text-muted-foreground">0{index + 1}</span>
                      </div>
                      <p className="mt-4 font-semibold">{label}</p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">{detail}</p>
                    </div>
                  );
                })}
              </div>

              <div className="rounded-[22px] bg-background/85 p-4 sm:p-5" aria-labelledby="product-surfaces-title">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{text.productMap}</p>
                <h2 id="product-surfaces-title" className="mt-2 text-xl font-semibold">{text.domainsTitle}</h2>
                <div className="mt-4 divide-y divide-border/70">
                  {productSurfaces.map((surface) => (
                    <div key={surface.enLabel} className="grid gap-1 py-3 sm:grid-cols-[7rem_1fr] sm:gap-4">
                      <p className="font-semibold">{isArabic ? surface.arLabel : surface.enLabel}</p>
                      <p className="text-sm leading-6 text-muted-foreground">{isArabic ? surface.arDetail : surface.enDetail}</p>
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">{text.capabilityNotice}</p>
            </div>
          </div>
        </section>

        <section className="container py-12" aria-labelledby="real-product-surface-title">
          <div className="grid gap-8 rounded-[28px] bg-card/70 p-5 sm:p-7 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">
            <figure className="mx-auto w-full max-w-[430px] overflow-hidden rounded-[24px] border border-border/70 bg-background shadow-card">
              <Image
                src="/product/plaivra-registration-mobile-2026-07-11.png"
                alt={isArabic ? "شاشة إنشاء حساب Plaivra والموافقات المطلوبة" : "Plaivra account creation and required consent screen"}
                width={430}
                height={932}
                sizes="(max-width: 1024px) 90vw, 430px"
                className="h-auto w-full"
              />
              <figcaption className="border-t border-border/70 p-3 text-xs leading-5 text-muted-foreground">{text.screenshotCaption}</figcaption>
            </figure>
            <div className="max-w-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{text.screenshotLabel}</p>
              <h2 id="real-product-surface-title" className="mt-2 text-3xl font-semibold tracking-tight">{text.screenshotTitle}</h2>
              <p className="mt-3 text-base leading-7 text-muted-foreground">{text.screenshotText}</p>
              <Button asChild size="lg" className="mt-6"><Link href="/register">{copy.createAccount}</Link></Button>
            </div>
          </div>
        </section>

        <section className="container py-8">
          <div className="grid gap-3 rounded-[20px] bg-card/70 p-3 sm:grid-cols-3 sm:p-4">
            <TrustItem icon={LockKeyhole} title={text.scopedTitle} text={text.scopedText} />
            <TrustItem icon={ShieldCheck} title={text.controlTitle} text={text.controlText} />
            <TrustItem icon={FileCheck2} title={text.correctionTitle} text={text.correctionText} />
          </div>
        </section>

        <section className="container py-12">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <Card key={feature.title} variant="glass">
                  <CardContent className="pt-5">
                    <Icon className="h-8 w-8 text-primary" />
                    <h2 className="mt-4 text-lg font-semibold">{feature.title}</h2>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{feature.text}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        <section className="container pb-12" aria-labelledby="landing-faq-title">
          <div className="mx-auto max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{text.faq}</p>
            <h2 id="landing-faq-title" className="mt-2 text-2xl font-semibold">{text.faqTitle}</h2>
            <div className="mt-5 divide-y divide-border/70 rounded-[20px] bg-card/70 px-4 sm:px-5">
              <details className="group py-4">
                <summary className="flex min-h-11 cursor-pointer items-center font-semibold">{text.ageQuestion}</summary>
                <p className="pb-2 text-sm leading-6 text-muted-foreground">{text.ageAnswer}</p>
              </details>
              <details className="group py-4">
                <summary className="flex min-h-11 cursor-pointer items-center font-semibold">{text.profileQuestion}</summary>
                <p className="pb-2 text-sm leading-6 text-muted-foreground">{text.profileAnswer}</p>
              </details>
              <details className="group py-4">
                <summary className="flex min-h-11 cursor-pointer items-center font-semibold">{text.correctionQuestion}</summary>
                <p className="pb-2 text-sm leading-6 text-muted-foreground">{text.correctionAnswer}</p>
              </details>
            </div>
          </div>
        </section>

        <section className="container pb-12" aria-labelledby="platform-availability-title">
          <div className="grid gap-6 rounded-[22px] bg-card/70 p-5 sm:grid-cols-[1fr_1.2fr] sm:items-center sm:p-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{text.availability}</p>
              <h2 id="platform-availability-title" className="mt-2 text-2xl font-semibold">{text.availabilityTitle}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{text.availabilityText}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex gap-3 rounded-[18px] bg-background/70 p-4">
                <Monitor className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div><p className="font-semibold">{text.web}</p><p className="mt-1 text-sm text-muted-foreground">{text.webStatus}</p></div>
              </div>
              <div className="flex gap-3 rounded-[18px] bg-background/70 p-4">
                <TimerReset className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div><p className="font-semibold">{text.futurePlatforms}</p><p className="mt-1 text-sm text-muted-foreground">{text.futureStatus}</p></div>
              </div>
            </div>
          </div>
        </section>

        <section className="container pb-14">
          <div className="grid gap-4 rounded-[22px] border border-primary/25 bg-primary/5 p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6">
            <div>
              <h2 className="text-2xl font-semibold">{text.ctaTitle}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{text.ctaText}</p>
              <div className="mt-3 flex flex-wrap gap-3 text-sm">
                {trustLinks.map((item) => (
                  <Link key={item.href} href={item.href} className="inline-flex min-h-11 items-center font-semibold text-primary underline">
                    {isArabic ? item.arLabel : item.enLabel}: {isArabic ? item.arText : item.enText}
                  </Link>
                ))}
              </div>
            </div>
            <div className="grid gap-2 sm:min-w-[220px]">
              <Button asChild size="lg"><Link href="/register">{copy.createAccount}</Link></Button>
              <Button asChild size="lg" variant="outline"><Link href="/login">{copy.login}</Link></Button>
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}

function TrustItem({ icon: Icon, title, text }: { icon: typeof LockKeyhole; title: string; text: string }) {
  return (
    <div className="flex gap-3 rounded-[16px] bg-background/55 p-3">
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
      <div>
        <p className="font-semibold">{title}</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{text}</p>
      </div>
    </div>
  );
}
