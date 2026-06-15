"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  Settings,
  Shield,
  Soup,
  Trophy,
  User,
  Utensils,
  Weight
} from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useAuth } from "@/components/auth/auth-provider";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  activePaths?: string[];
};

const navGroups: { label: string; items: NavItem[] }[] = [
  { label: "Today", items: [{ href: "/dashboard", label: "Today", icon: Home }] },
  {
    label: "Train",
    items: [
      { href: "/my-workout/plans", label: "Workout Plans", icon: CalendarCheck, activePaths: ["/my-workout/plans", "/today-workout", "/workouts/session"] },
      { href: "/workouts", label: "Exercise Library", icon: Dumbbell },
      { href: "/workout-history", label: "Workout History", icon: History }
    ]
  },
  {
    label: "Eat",
    items: [
      { href: "/calories", label: "Food Log", icon: Utensils, activePaths: ["/calories"] },
      { href: "/my-meal-plan", label: "Meal Plan", icon: ClipboardList },
      { href: "/calories/custom-food-meal", label: "Food Builder", icon: ChefHat },
      { href: "/calories/weekly-overview", label: "Nutrition Summary", icon: Soup }
    ]
  },
  {
    label: "Progress",
    items: [
      { href: "/progress", label: "Progress", icon: BarChart3 },
      { href: "/personal-records", label: "Personal Records", icon: Trophy }
    ]
  },
  {
    label: "Wellness",
    items: [
      { href: "/wellness", label: "Wellness Dashboard", icon: CheckSquare },
      { href: "/hydration", label: "Hydration", icon: Droplets },
      { href: "/habits", label: "Habits", icon: CalendarCheck },
      { href: "/sleep-recovery", label: "Sleep & Recovery", icon: BedDouble },
      { href: "/supplements", label: "Supplements", icon: Pill },
      { href: "/daily-fit-tasks", label: "Daily Fit Tasks", icon: CheckSquare }
    ]
  },
  { label: "Settings", items: [{ href: "/settings", label: "Settings", icon: Settings, activePaths: ["/settings", "/profile"] }] }
];

const mobilePrimaryItems: NavItem[] = [
  { href: "/dashboard", label: "Today", icon: Home, activePaths: ["/dashboard"] },
  { href: "/my-workout/plans", label: "Train", icon: Dumbbell, activePaths: ["/today-workout", "/my-workout", "/workouts", "/workout-history", "/personal-records"] },
  { href: "/calories", label: "Eat", icon: Utensils, activePaths: ["/calories", "/my-meal-plan"] },
  { href: "/progress", label: "Progress", icon: BarChart3, activePaths: ["/progress"] },
  { href: "/wellness", label: "Wellness", icon: CheckSquare, activePaths: ["/wellness", "/hydration", "/habits", "/sleep-recovery", "/supplements", "/daily-fit-tasks"] },
  { href: "/settings", label: "More", icon: Settings, activePaths: ["/settings", "/profile"] }
];

const adminItems: NavItem[] = [
  { href: "/admin", label: "Admin", icon: Shield },
  { href: "/admin/audit", label: "Audit & Quality", icon: ClipboardList },
  { href: "/admin/foods", label: "Foods", icon: Soup },
  { href: "/admin/workouts", label: "Workouts", icon: Weight },
  { href: "/admin/settings", label: "Settings", icon: Settings }
];

function isActivePath(pathname: string, item: NavItem) {
  const paths = item.activePaths ?? [item.href];
  return paths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { profile, isAdmin, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-transparent text-foreground">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 border-r border-border/70 bg-card/80 shadow-soft backdrop-blur-xl lg:flex lg:flex-col">
        <div className="flex h-20 items-center px-6">
          <Brand href="/dashboard" />
        </div>
        <nav className="flex-1 space-y-5 overflow-y-auto px-4 pb-4" aria-label="Main navigation">
          {navGroups.map((group) => (
            <div key={group.label}>
              <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{group.label}</p>
              <div className="space-y-1">
                {group.items.map((item) => <SidebarLink key={`${item.href}-${item.label}`} item={item} active={isActivePath(pathname, item)} />)}
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
        <div className="border-t border-border/70 p-4">
          <div className="rounded-2xl bg-background/70 p-3">
            <p className="truncate text-sm font-semibold text-foreground">{profile?.full_name || "FitLife Hub member"}</p>
            <p className="truncate text-xs text-muted-foreground">{profile?.email}</p>
            <Button variant="ghost" className="mt-3 w-full justify-start" onClick={signOut}>
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </aside>
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/75 backdrop-blur-xl lg:ml-72">
        <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3 lg:hidden">
            <MobileMenu pathname={pathname} isAdmin={isAdmin} signOut={signOut} />
            <Brand href="/dashboard" />
          </div>
          <div className="hidden lg:block">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">FitLife Hub</p>
            <h1 className="text-base font-semibold text-foreground">Today, training, nutrition, progress</h1>
          </div>
          <Button variant="outline" size="sm" onClick={signOut} className="hidden lg:inline-flex">
            <LogOut className="h-4 w-4" />
            Logout
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
      <MobilePrimaryNav pathname={pathname} />
    </div>
  );
}

function MobilePrimaryNav({ pathname }: { pathname: string }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-border/70 bg-card/95 px-1 pb-[max(env(safe-area-inset-bottom),0.25rem)] pt-1 shadow-luxe backdrop-blur-xl lg:hidden" aria-label="Primary mobile navigation">
      {mobilePrimaryItems.map((item) => {
        const Icon = item.icon;
        const active = isActivePath(pathname, item);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-medium transition focus-visible:ring-2 focus-visible:ring-ring",
              active ? "bg-primary text-primary-foreground shadow-soft" : "text-muted-foreground hover:bg-muted/60 hover:text-primary"
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function MobileMenu({ pathname, isAdmin, signOut }: { pathname: string; isAdmin: boolean; signOut: () => Promise<void> }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Open navigation menu">
          <Menu className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Navigation</DialogTitle>
        </DialogHeader>
        <div className="max-h-[calc(90dvh-7rem)] overflow-y-auto pr-1">
          <div className="space-y-5">
            {navGroups.map((group) => (
              <div key={group.label}>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{group.label}</p>
                <div className="space-y-1">
                  {group.items.map((item) => (
                    <DialogClose key={`${item.href}-${item.label}`} asChild>
                      <SidebarLink item={item} active={isActivePath(pathname, item)} mobile />
                    </DialogClose>
                  ))}
                </div>
              </div>
            ))}
            {isAdmin ? (
              <div className="border-t border-border/70 pt-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Admin</p>
                {adminItems.map((item) => (
                  <DialogClose key={item.href} asChild>
                    <SidebarLink item={item} active={isActivePath(pathname, item)} mobile />
                  </DialogClose>
                ))}
              </div>
            ) : null}
            <Button variant="ghost" className="w-full justify-start" onClick={signOut}>
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SidebarLink({ item, active, mobile = false }: { item: NavItem; active: boolean; mobile?: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition focus-visible:ring-2 focus-visible:ring-ring",
        active ? "bg-primary text-primary-foreground shadow-soft" : "text-muted-foreground hover:bg-muted/60 hover:text-primary",
        mobile && "min-h-12 py-3"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span>{item.label}</span>
    </Link>
  );
}
