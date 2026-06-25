import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/auth/auth-provider";
import { ToastProvider } from "@/components/ui/toaster";
import { AppPreferenceEffects } from "@/components/settings/app-preference-effects";
import { UserSettingsProvider } from "@/lib/settings/user-settings-context";
import { createThemeBootstrapScript } from "@/lib/themes";

export const metadata: Metadata = {
  title: "Plaivra",
  description: "Simple workout, meal, and progress tracking for real life."
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: createThemeBootstrapScript() }} />
      </head>
      <body className="font-sans">
        <a
          href="#main-content"
          className="sr-only fixed left-4 top-4 z-[100] rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-luxe focus:not-sr-only"
        >
          Skip to content
        </a>
        <ToastProvider>
          <AuthProvider>
            <UserSettingsProvider>
              <AppPreferenceEffects />
              {children}
            </UserSettingsProvider>
          </AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
