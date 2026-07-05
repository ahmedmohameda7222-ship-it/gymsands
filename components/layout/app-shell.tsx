"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  BarChart3,
  BedDouble,
  CalendarCheck,
  ChefHat,
  CheckSquare,
  ClipboardList,
  Droplets,
  Dumbbell,
  History,
  Home,
  LogOut,
  Menu,
  Pill,
  Plus,
  Settings,
  Shield,
  Soup,
  Trophy,
  Utensils,
  WifiOff
} from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useAuth } from "@/components/auth/auth-provider";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/use-translation";
import type { TranslationKey } from "@/lib/i18n/types";
import { useUserSettings } from "@/lib/settings/user-settings-context";
import type { QuickLogSection } from "@/services/database/user-settings";
import { ActiveWorkoutIndicator } from "@/components/workouts/active-workout-indicator";

type NavItem = {
  href: string;
  labelKey: TranslationKey;
  icon: ComponentType<{ className?: string }>;
  activePaths?: string[];
  exact?: boolean;
};

const navGroups: { labelKey: TranslationKey; items: NavItem[] }[] = [
  { labelKey: "nav.today", items: [{ href: "/dashboard", labelKey: "nav.today", icon: Home }] },
  {
    labelKey: "nav.train",
    items: [
      { href: "/my-workout/plans", labelKey: "nav.workoutPlans", icon: CalendarCheck, activePaths: ["/my-workout/plans", "/today-workout", "/workouts/session"] },
      { href: "/workouts", labelKey: "nav.exerciseLibrary", icon: Dumbbell },
      { href: "/workout-history", labelKey: "nav.workoutHistory", icon: History }
    ]
  },
  {
    labelKey: "nav.eat",
    items: [
      { href: "/calories", labelKey: "nav.foodLog", icon: Utensils, activePaths: ["/calories"], exact: true },
      { href: "/calories/food-hub", labelKey: "nav.foodHub", icon: ChefHat },
      { href: "/my-meal-plan", labelKey: "nav.mealPlan", icon: ClipboardList },
      { href: "/calories/weekly-overview", labelKey: "nav.nutritionSummary", icon: Soup }
    ]
  },
  {
    labelKey: "nav.progress",
    items: [
      { href: "/progress", labelKey: "nav.progress", icon: BarChart3 },
      { href: "/personal-records", labelKey: "nav.personalRecords", icon: Trophy }
    ]
  },
  {
    labelKey: "nav.wellness",
    items: [
      { href: "/wellness", labelKey: "nav.wellnessDashboard", icon: CheckSquare },
      { href: "/hydration", labelKey: "nav.hydration", icon: Droplets },
      { href: "/habits", labelKey: "nav.habits", icon: CalendarCheck },
      { href: "/sleep-recovery", labelKey: "nav.sleepRecovery", icon: BedDouble },
      { href: "/supplements", labelKey: "nav.supplements", icon: Pill },
      { href: "/daily-fit-tasks", labelKey: "nav.dailyFitTasks", icon: CheckSquare }
    ]
  },
  { labelKey: "nav.settings", items: [{ href: "/settings", labelKey: "nav.settings", icon: Settings, activePaths: ["/settings", "/profile"] }] }
];

const mobilePrimaryItems: NavItem[] = [
  { href: "/dashboard", labelKey: "nav.today", icon: Home, activePaths: ["/dashboard"] },
  { href: "/my-workout/plans", labelKey: "nav.train", icon: Dumbbell, activePaths: ["/today-workout", "/my-workout", "/workouts", "/workout-history"] },
  { href: "/calories", labelKey: "nav.eat", icon: Utensils, activePaths: ["/calories", "/my-meal-plan"] }
];

const adminItems: NavItem[] = [
  { href: "/admin", labelKey: "settings.accountSession", icon: Shield }
];

const moreActivePaths = [
  "/progress",
  "/personal-records",
  "/wellness",
  "/hydration",
  "/habits",
  "/sleep-recovery",
  "/supplements",
  "/daily-fit-tasks",
  "/settings",
  "/profile",
  "/admin"
];

const quickLogItems: (NavItem & { id: QuickLogSection })[] = [
  { id: "water", href: "/hydration", labelKey: "nav.addWater", icon: Droplets },
  { id: "meal", href: "/calories", labelKey: "nav.logFood", icon: Utensils },
  { id: "weight", href: "/progress", labelKey: "settings.weight", icon: BarChart3 },
  { id: "workout", href: "/today-workout", labelKey: "nav.startWorkout", icon: Dumbbell },
  { id: "progress", href: "/progress", labelKey: "nav.addProgress", icon: BarChart3 },
  { id: "sleep", href: "/sleep-recovery", labelKey: "nav.sleepRecovery", icon: BedDouble },
  { id: "supplements", href: "/supplements", labelKey: "nav.supplements", icon: Pill },
  { id: "wellness", href: "/wellness", labelKey: "nav.wellnessDashboard", icon: CheckSquare }
];

function isActivePath(pathname: string, item: NavItem) {
  const paths = item.activePaths ?? [item.href];
  if (item.exact) {
    return paths.some((path) => pathname === path);
  }
  return paths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function isMoreActive(pathname: string) {
  return moreActivePaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
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
        {isOffline ? <div className="fixed inset-x-3 top-3 z-[65] mx-auto max-w-xl rounded-[14px] border border-warning/40 bg-card p-3 text-sm shadow-lg" role="status"><p className="flex items-center justify-center gap-2 font-semibold text-foreground"><WifiOff className="h-4 w-4 text-warning" /> You appear offline. Changes may not save until the connection returns.</p></div> : null}
        <main id="main-content" className="min-h-dvh">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="premium-page-bg min-h-screen text-foreground">
      {isOffline ? <div className="fixed inset-x-3 top-[4.5rem] z-[65] mx-auto max-w-xl rounded-[14px] border border-warning/40 bg-card p-3 text-sm shadow-lg lg:left-72" role="status"><p className="flex items-center justify-center gap-2 font-semibold text-foreground"><WifiOff className="h-4 w-4 text-warning" /> You appear offline. Changes may not save until the connection returns.</p></div> : null}
      <aside className="glass-shell fixed inset-y-0 left-0 z-40 hidden w-72 border-y-0 border-l-0 lg:flex lg:flex-col">
        <div className="flex h-20 items-center px-6">
          <Brand href="/dashboard" />
        </div>
        <nav className="flex-1 space-y-5 overflow-y-auto px-4 pb-4" aria-label="Main navigation">
          {navGroups.map((group) => (
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
            <Button variant="ghost" className="mt-3 w-full justify-start" onClick={signOut}>
              <LogOut className="h-4 w-4" />
              {t("nav.logout")}
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
          <Button variant="outline" size="sm" onClick={signOut} className="hidden lg:inline-flex">
            <LogOut className="h-4 w-4" />
            {t("nav.logout")}
          </Button>
        </div>
      </header>
      <main id="main-content" className="pb-32 lg:ml-72 lg:pb-0">
        <motion.div
          key={pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 sm:py-7 lg:px-8"
        >
          {children}
        </motion.div>
      </main>
      <ActiveWorkoutIndicator />
      <MobilePrimaryNav pathname={pathname} isAdmin={isAdmin} signOut={signOut} />
    </div>
  );
}

function MobilePrimaryNav({ pathname, isAdmin, signOut }: { pathname: string; isAdmin: boolean; signOut: () => Promise<void> }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-[80] isolate lg:hidden">
      <QuickLogSheet />
      <nav className="glass-shell grid grid-cols-4 !rounded-none border-x-0 border-b-0 !bg-card px-2 pb-[calc(env(safe-area-inset-bottom)+0.35rem)] pt-1" aria-label="Primary mobile navigation">
        {mobilePrimaryItems.map((item) => (
          <MobileNavLink key={item.href} item={item} active={isActivePath(pathname, item)} />
        ))}
        <MobileMenu pathname={pathname} isAdmin={isAdmin} signOut={signOut} asNavItem active={isMoreActive(pathname)} />
      </nav>
    </div>
  );
}

function MobileNavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  const { t } = useTranslation();
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-14 flex-col items-center justify-center gap-1 border-t-2 px-1 text-[11px] font-bold leading-[14px] transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-primary"
      )}
    >
      <Icon className="h-5 w-5" />
      <span className="truncate">{t(item.labelKey)}</span>
    </Link>
  );
}

function QuickLogSheet() {
  const { t } = useTranslation();
  const { settings } = useUserSettings();
  const visibleItems = quickLogItems.filter((item) => settings.quickLogSections.includes(item.id));
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          size="icon"
          className="absolute left-1/2 top-0 z-[90] h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-[var(--app-bg)] bg-primary text-primary-foreground shadow-[var(--shadow-floating)] hover:bg-primary/90"
          aria-label={t("nav.quickLog")}
        >
          <Plus className="h-6 w-6" />
        </Button>
      </DialogTrigger>
      <DialogContent variant="glass" className="rounded-t-[24px] p-0 sm:max-w-sm">
        <DialogHeader className="border-b border-white/40 px-5 py-4 text-left dark:border-white/10">
          <DialogTitle>{t("nav.quickLog")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2 p-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            return (
              <DialogClose key={item.id} asChild>
                <Link href={item.href} className="solid-row flex min-h-12 items-center gap-3 px-3 text-sm font-semibold text-foreground transition-colors hover:border-primary/40 hover:bg-muted/60">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </span>
                  {t(item.labelKey)}
                </Link>
              </DialogClose>
            );
          })}
          {visibleItems.length === 0 ? <p className="p-3 text-center text-sm text-muted-foreground">Choose Quick Log items in Settings → Preferences.</p> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MobileMenu({
  pathname,
  isAdmin,
  signOut,
  asNavItem = false,
  active = false
}: {
  pathname: string;
  isAdmin: boolean;
  signOut: () => Promise<void>;
  asNavItem?: boolean;
  active?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();

  function handleNavigate() {
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {asNavItem ? (
          <button
            type="button"
            aria-label={t("nav.more")}
            className={cn(
            "flex min-h-14 flex-col items-center justify-center gap-1 border-t-2 px-1 text-[11px] font-bold leading-[14px] transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-primary"
            )}
          >
            <Settings className="h-5 w-5" />
            <span>{t("nav.more")}</span>
          </button>
        ) : (
          <Button variant="outline" size="icon" aria-label={t("nav.more")}>
            <Menu className="h-5 w-5" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent variant="glass" className="inset-y-0 left-0 right-auto top-0 h-dvh max-h-dvh w-[86vw] max-w-sm translate-x-0 translate-y-0 rounded-none border-y-0 border-l-0 border-r p-0 data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:slide-in-from-left data-[state=open]:duration-300 data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:slide-out-to-left data-[state=closed]:duration-300 sm:left-0 sm:top-0 sm:max-w-sm sm:translate-x-0 sm:translate-y-0 sm:rounded-none">
        <DialogHeader className="border-b border-white/40 px-5 py-4 text-left dark:border-white/10">
          <DialogTitle>{t("nav.more")}</DialogTitle>
        </DialogHeader>
        <div className="h-[calc(100dvh-4.5rem)] overflow-y-auto px-4 py-4">
          <div className="space-y-4">
            {navGroups.map((group) => {
              const visibleInMore = group.labelKey === "nav.today" ? group.items.slice(0, 0) : group.items;
              if (visibleInMore.length === 0) return null;
              return (
                <div key={group.labelKey}>
                  <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t(group.labelKey)}</p>
                  <div className="space-y-1">
                    {visibleInMore.map((item) => (
                      <SidebarLink key={`${item.href}-${item.labelKey}`} item={item} active={isActivePath(pathname, item)} mobile onClick={handleNavigate} />
                    ))}
                  </div>
                </div>
              );
            })}
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
              className="w-full justify-start"
              onClick={() => {
                handleNavigate();
                void signOut();
              }}
            >
              <LogOut className="h-4 w-4" />
              {t("nav.logout")}
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
        "flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-semibold transition focus-visible:ring-2 focus-visible:ring-ring",
        active ? "bg-primary text-primary-foreground shadow-soft" : "text-muted-foreground hover:bg-white/35 hover:text-primary dark:hover:bg-white/10",
        mobile && "min-h-12 py-3"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span>{t(item.labelKey)}</span>
    </Link>
  );
}
