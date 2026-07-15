"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ComponentType, type CSSProperties, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  BarChart3,
  ChefHat,
  CheckSquare,
  ClipboardList,
  Dumbbell,
  History,
  Home,
  LogOut,
  Menu,
  Settings,
  Shield,
  Soup,
  Trophy,
  UserRound,
  Utensils,
  WifiOff
} from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useAuth } from "@/components/auth/auth-provider";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/use-translation";
import type { TranslationKey } from "@/lib/i18n/types";
import { useUserSettings } from "@/lib/settings/user-settings-context";
import { ActiveWorkoutIndicator } from "@/components/workouts/active-workout-indicator";
import { MobileFloatingNav } from "@/components/layout/mobile-floating-nav";
import { getTrainNavigationTarget } from "@/lib/navigation/mobile-nav";

type NavItem = {
  href: string;
  labelKey: TranslationKey;
  icon: ComponentType<{ className?: string }>;
  activePaths?: string[];
  exact?: boolean;
};

const primaryNavItems: NavItem[] = [
  { href: "/dashboard", labelKey: "nav.today", icon: Home, activePaths: ["/dashboard"] },
  { href: "/my-workout/plans", labelKey: "nav.train", icon: Dumbbell },
  { href: "/calories", labelKey: "nav.eat", icon: Utensils, activePaths: ["/calories"] },
  { href: "/progress", labelKey: "nav.progress", icon: BarChart3, activePaths: ["/progress", "/personal-records"] },
  { href: "/settings", labelKey: "nav.settings", icon: Settings, activePaths: ["/settings", "/profile"] }
];

const secondaryNavGroups: { labelKey: TranslationKey; items: NavItem[] }[] = [
  {
    labelKey: "nav.train",
    items: [
      { href: "/workouts", labelKey: "nav.exerciseLibrary", icon: Dumbbell },
      { href: "/workout-history", labelKey: "nav.workoutHistory", icon: History }
    ]
  },
  {
    labelKey: "nav.eat",
    items: [
      { href: "/calories/food-hub", labelKey: "nav.foodHub", icon: ChefHat },
      { href: "/my-meal-plan", labelKey: "nav.mealPlan", icon: ClipboardList },
      { href: "/calories/weekly-overview", labelKey: "nav.nutritionSummary", icon: Soup }
    ]
  },
  {
    labelKey: "nav.wellness",
    items: [{ href: "/wellness", labelKey: "nav.wellnessDashboard", icon: CheckSquare }]
  },
  {
    labelKey: "nav.progress",
    items: [{ href: "/personal-records", labelKey: "nav.personalRecords", icon: Trophy }]
  }
];

const mobileUtilityItems: NavItem[] = [
  { href: "/progress", labelKey: "nav.progress", icon: BarChart3, activePaths: ["/progress", "/personal-records"] },
  { href: "/settings", labelKey: "nav.settings", icon: Settings, activePaths: ["/settings"] },
  { href: "/profile", labelKey: "settings.profile", icon: UserRound, activePaths: ["/profile"] }
];

const adminItems: NavItem[] = [
  { href: "/admin", labelKey: "settings.accountSession", icon: Shield }
];

const appShellBottomLayout = {
  "--mobile-nav-height": "4.5rem",
  "--mobile-nav-bottom-offset": "0.75rem",
  "--active-workout-controller-gap": "0.5rem",
  "--active-workout-controller-bottom": "calc(env(safe-area-inset-bottom) + var(--mobile-nav-bottom-offset) + var(--mobile-nav-height) + var(--active-workout-controller-gap))",
  "--app-bottom-overlay-stack": "calc(var(--active-workout-controller-bottom) + var(--active-workout-controller-height, 0px))",
  "--app-bottom-reserved-space": "calc(var(--app-bottom-overlay-stack) + 2rem)",
  "--train-sticky-footer-bottom": "calc(var(--app-bottom-overlay-stack) + 0.5rem)",
  "--desktop-active-workout-controller-bottom": "1.25rem",
  "--desktop-app-bottom-reserved-space": "calc(var(--desktop-active-workout-controller-bottom) + var(--active-workout-controller-height, 0px) + 2rem)",
  "--desktop-train-sticky-footer-bottom": "calc(var(--desktop-active-workout-controller-bottom) + var(--active-workout-controller-height, 0px) + 0.5rem)"
} as CSSProperties;

function isActivePath(pathname: string, item: NavItem) {
  const trainTarget = getTrainNavigationTarget(pathname);
  if (item.href === "/my-workout/plans") return trainTarget === "train";
  if (item.href === "/workouts") return trainTarget === "exercise-library";
  if (item.href === "/workout-history") return trainTarget === "workout-history";
  const paths = item.activePaths ?? [item.href];
  if (item.exact) return paths.some((path) => pathname === path);
  return paths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { profile, isAdmin, signOut } = useAuth();
  const { settings } = useUserSettings();
  const { t } = useTranslation();
  const hideProfileDetails = settings.hideProfileDetails || settings.privateProfileMode;
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const update = () => setIsOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (pathname === "/onboarding") {
    return (
      <div className="premium-page-bg min-h-dvh text-foreground">
        <main id="main-content" className="mx-auto min-h-dvh w-full max-w-5xl overflow-x-clip px-4 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-5 sm:px-6 sm:py-8">
          {children}
        </main>
      </div>
    );
  }

  const isWorkoutSessionRoute = pathname.startsWith("/workouts/session");

  if (isWorkoutSessionRoute) {
    return (
      <div className="premium-page-bg relative min-h-dvh overflow-hidden text-foreground">
        {isOffline ? (
          <div className="fixed inset-x-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[65] mx-auto max-w-xl rounded-[14px] border border-warning/40 bg-card p-3 text-sm shadow-lg" role="status">
            <p className="flex items-center justify-center gap-2 font-semibold text-foreground"><WifiOff className="h-4 w-4 text-warning" /> You are offline. New changes may not sync until connection returns.</p>
          </div>
        ) : null}
        <main id="main-content" className="min-h-dvh">{children}</main>
      </div>
    );
  }

  return (
    <div className="premium-page-bg min-h-screen text-foreground" data-app-shell style={appShellBottomLayout}>
      {isOffline ? (
        <div className="fixed inset-x-3 top-[calc(env(safe-area-inset-top)+4.75rem)] z-[65] mx-auto max-w-xl rounded-[14px] border border-warning/40 bg-card p-3 text-sm shadow-lg lg:left-72" role="status">
          <p className="flex items-center justify-center gap-2 font-semibold text-foreground"><WifiOff className="h-4 w-4 text-warning" /> You are offline. New changes may not sync until connection returns.</p>
        </div>
      ) : null}
      <aside className="glass-shell fixed inset-y-0 left-0 z-40 hidden w-72 border-y-0 border-l-0 lg:flex lg:flex-col">
        <div className="flex h-20 items-center px-6"><Brand href="/dashboard" /></div>
        <nav className="flex-1 space-y-6 overflow-y-auto px-4 pb-4" aria-label="Main navigation">
          <div>
            <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Primary</p>
            <div className="space-y-1">
              {primaryNavItems.map((item) => <SidebarLink key={item.href} item={item} active={isActivePath(pathname, item)} />)}
            </div>
          </div>
          {secondaryNavGroups.map((group) => (
            <div key={group.labelKey}>
              <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t(group.labelKey)}</p>
              <div className="space-y-1">
                {group.items.map((item) => <SidebarLink key={`${item.href}-${item.labelKey}`} item={item} active={isActivePath(pathname, item)} />)}
              </div>
            </div>
          ))}
          {isAdmin ? (
            <div className="mt-6 border-t border-border/70 pt-4">
              <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Admin</p>
              {adminItems.map((item) => <SidebarLink key={item.href} item={item} active={isActivePath(pathname, item)} />)}
            </div>
          ) : null}
        </nav>
        <div className="border-t border-white/40 p-4 dark:border-white/10">
          <div className="glass-card-strong p-3 shadow-none">
            <p className="truncate text-sm font-semibold text-foreground">{hideProfileDetails ? t("nav.member") : profile?.full_name || t("nav.member")}</p>
            {!hideProfileDetails ? <p className="truncate text-xs text-muted-foreground">{profile?.email}</p> : null}
            <Button variant="ghost" className="mt-3 min-h-12 w-full justify-start" onClick={signOut}>
              <LogOut className="h-4 w-4" />{t("nav.logout")}
            </Button>
          </div>
        </div>
      </aside>
      <header className="glass-shell sticky top-0 z-30 border-x-0 border-t-0 lg:ml-72">
        <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:h-[72px] lg:px-8">
          <div className="flex min-w-0 items-center gap-3 lg:hidden">
            <MobileMenu pathname={pathname} isAdmin={isAdmin} signOut={signOut} />
            <Brand href="/dashboard" />
          </div>
          <div className="hidden lg:block">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Plaivra</p>
            <h1 className="text-base font-semibold text-foreground">{t("nav.tagline")}</h1>
          </div>
        </div>
      </header>
      <main id="main-content" className="pb-[var(--app-bottom-reserved-space)] lg:ml-72 lg:pb-[var(--desktop-app-bottom-reserved-space)]">
        <motion.div
          key={pathname}
          initial={settings.reduceAnimations ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={settings.reduceAnimations ? { duration: 0 } : { duration: 0.22, ease: "easeOut" }}
          className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 sm:py-7 lg:px-8"
        >
          {children}
        </motion.div>
      </main>
      <ActiveWorkoutIndicator />
      <MobileFloatingNav pathname={pathname} />
    </div>
  );
}

function MobileMenu({ pathname, isAdmin, signOut }: { pathname: string; isAdmin: boolean; signOut: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();
  const { settings } = useUserSettings();

  function handleNavigate() {
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" className="h-12 w-12" aria-label={t("nav.more")}><Menu className="h-5 w-5" /></Button>
      </DialogTrigger>
      <DialogContent
        variant="glass"
        className={cn(
          "inset-y-0 left-0 right-auto top-0 h-dvh max-h-dvh w-[86vw] max-w-sm translate-x-0 translate-y-0 rounded-none border-y-0 border-l-0 border-r p-0 sm:left-0 sm:top-0 sm:max-w-sm sm:translate-x-0 sm:translate-y-0 sm:rounded-none",
          !settings.reduceAnimations && "data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:slide-in-from-left data-[state=open]:duration-300 data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:slide-out-to-left data-[state=closed]:duration-300"
        )}
      >
        <DialogHeader className="border-b border-white/40 px-5 py-4 text-left dark:border-white/10">
          <DialogTitle>{t("nav.more")}</DialogTitle>
        </DialogHeader>
        <div className="h-[calc(100dvh-4.5rem)] overflow-y-auto px-4 py-4">
          <div className="space-y-4">
            {secondaryNavGroups.map((group) => (
              <div key={group.labelKey}>
                <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t(group.labelKey)}</p>
                <div className="space-y-1">
                  {group.items.map((item) => (
                    <SidebarLink key={`${item.href}-${item.labelKey}`} item={item} active={isActivePath(pathname, item)} mobile onClick={handleNavigate} />
                  ))}
                </div>
              </div>
            ))}
            <div className="border-t border-white/40 pt-4 dark:border-white/10">
              <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("nav.more")}</p>
              <div className="space-y-1">
                {mobileUtilityItems.map((item) => (
                  <SidebarLink key={`${item.href}-${item.labelKey}`} item={item} active={isActivePath(pathname, item)} mobile onClick={handleNavigate} />
                ))}
              </div>
            </div>
            {isAdmin ? (
              <div className="border-t border-white/40 pt-4 dark:border-white/10">
                <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Admin</p>
                {adminItems.map((item) => (
                  <SidebarLink key={item.href} item={item} active={isActivePath(pathname, item)} mobile onClick={handleNavigate} />
                ))}
              </div>
            ) : null}
            <Button
              variant="ghost"
              className="min-h-12 w-full justify-start"
              onClick={() => {
                handleNavigate();
                void signOut();
              }}
            >
              <LogOut className="h-4 w-4" />{t("nav.logout")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SidebarLink({ item, active, mobile = false, onClick }: { item: NavItem; active: boolean; mobile?: boolean; onClick?: () => void }) {
  const Icon = item.icon;
  const { t } = useTranslation();
  return (
    <Link
      href={item.href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-12 items-center gap-3 rounded-2xl px-3 py-2 text-sm font-semibold transition focus-visible:ring-2 focus-visible:ring-ring",
        active ? "bg-primary text-primary-foreground shadow-soft" : "text-muted-foreground hover:bg-white/35 hover:text-primary dark:hover:bg-white/10",
        mobile && "min-h-12 py-3"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span>{t(item.labelKey)}</span>
    </Link>
  );
}
