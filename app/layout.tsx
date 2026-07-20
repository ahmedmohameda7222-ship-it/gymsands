import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import "./globals.css";
import { AuthProvider } from "@/components/auth/auth-provider";
import { SuccessFeedbackProvider } from "@/components/feedback/success-feedback";
import { AppPreferenceEffects } from "@/components/settings/app-preference-effects";
import { ToastProvider } from "@/components/ui/toaster";
import { getLocaleMetadata } from "@/lib/i18n/config";
import { getRequestLanguage } from "@/lib/i18n/server";
import { UserSettingsProvider } from "@/lib/settings/user-settings-context";
import { createThemeBootstrapScript } from "@/lib/themes";

export const metadata: Metadata = {
  title: "Plaivra",
  description: "Simple workout, meal, and progress tracking for real life.",
  icons: {
    icon: [{ url: "/plaivra-logo.png", type: "image/png" }],
    apple: [{ url: "/plaivra-logo.png", type: "image/png" }]
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, preference } = await getRequestLanguage();
  const [messages, common] = await Promise.all([getMessages(), getTranslations("Common")]);
  const { direction } = getLocaleMetadata(locale);
  const initialLanguagePreference = preference ?? locale;

  return (
    <html
      lang={locale}
      dir={direction}
      data-request-locale={locale}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: createThemeBootstrapScript() }} />
      </head>
      <body className="font-sans">
        <a
          href="#main-content"
          className="sr-only fixed left-4 top-4 z-[100] rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-luxe focus:not-sr-only"
        >
          {common("skipToContent")}
        </a>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ToastProvider>
            <AuthProvider>
              <UserSettingsProvider initialLanguagePreference={initialLanguagePreference}>
                <SuccessFeedbackProvider>
                  <AppPreferenceEffects />
                  {children}
                </SuccessFeedbackProvider>
              </UserSettingsProvider>
            </AuthProvider>
          </ToastProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
