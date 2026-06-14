"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  BarChart3,
  BedDouble,
  CalendarClock,
  ClipboardList,
  CalendarCheck,
  ChefHat,
  CheckSquare,
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

const navGroups = [
  {
    label: "Today",
    items: [
      { href: "/dashboard", label: "Today", icon: Home },
      { href: "/today-workout", label: "Today's Workout", icon: CalendarClock },
      { href: "/calories/weekly-overview", label: "Weekly Report", icon: BarChart3 }
    ]
  },
  {
    label: "Workouts",
    items: [
      { href: "/my-workout/plans", label: "Workout Plans", icon: CalendarCheck },
      { href: "/workout-history", label: "Workout History", icon: History },
      { href: "/workouts", label: "Exercise Library", icon: Dumbbell },
      { href: "/personal-records", label: "Personal Records", icon: Trophy }
    ]
  },
  {
    label: "Food",
    items: [
      { href: "/my-meal-plan", label: "Meal Plan", icon: ClipboardList },
      { href: "/calories", label: "Food Log & Macros", icon: Utensils },
      { href: "/meals", label: "Food Search", icon: Soup },
      { href: "/calories/custom-food-meal", label: "Food Builder", icon: ChefHat }
    ]
  },
  {
    label: "Wellness",
    items: [
      { href: "/hydration", label: "Hydration", icon: Droplets },
      { href: "/habits", label: "Habits", icon: CalendarCheck },
      { href: "/sleep-recovery", label: "Sleep & Recovery", icon: BedDouble },
      { href: "/supplements", label: "Supplements", icon: Pill },
      { href: "/daily-fit-tasks", label: "Daily Fit Tasks", icon: CheckSquare }
    ]
  },
  {
    label: "Progress & Settings",
    items: [
      { href: "/progress", label: "Progress", icon: BarChart3 },
      { href: "/profile", label: "Profile & Goals", icon: User },
      { href: "/settings", label: "Connected Apps & Settings", icon: Settings }
    ]
  }
];

const adminItems = [
  { href: "/admin", label: "Admin", icon: Shield },
  { href: "/admin/foods", label: "Foods", icon: Soup },
  { href: "/admin/workouts", label: "Workouts", icon: Weight },
  { href: "/admin/settings", label: "Settings", icon: Settings }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { profile, isAdmin, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 border-r bg-card/95 backdrop-blur lg:flex lg:flex-col">
        <div className="flex h-20 items-center px-6">
          <Brand href="/dashboard" />
        </div>
        <nav className="flex-1 space-y-5 overflow-y-auto px-4 pb-4">
          {navGroups.map((group) => (
            <div key={group.label}>
              <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</p>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <SidebarLink key={item.href} item={item} active={pathname === item.href || pathname.startsWith(`${item.href}/`)} />
                ))}
              </div>
            </div>
          ))}
          {isAdmin ? (
            <div className="mt-6 border-t pt-4">
              <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Admin</p>
              {adminItems.map((item) => (
                <SidebarLink key={item.href} item={item} active={pathname === item.href || pathname.startsWith(`${item.href}/`)} />
              ))}
            </div>
          ) : null}
        </nav>
        <div className="border-t p-4">
          <p className="text-sm font-semibold text-foreground">{profile?.full_name || "FitLife Hub member"}</p>
          <p className="truncate text-xs text-muted-foreground">{profile?.email}</p>
          <Button variant="ghost" className="mt-3 w-full justify-start" onClick={signOut}>
            <LogOut className="h-4 w-4" />
            Logout
          </Button>
        </div>
      </aside>

      <header className="sticky top-0 z-30 border-b bg-card/85 backdrop-blur lg:ml-72">
        <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 lg:hidden">
            <MobileMenu pathname={pathname} isAdmin={isAdmin} signOut={signOut} />
            <Brand href="/dashboard" />
          </div>
          <div className="hidden lg:block">
            <p className="text-sm text-muted-foreground">FitLife Hub</p>
            <h1 className="text-lg font-semibold">Today, workouts, food, progress</h1>
          </div>
          <Button variant="outline" size="sm" onClick={signOut} className="hidden lg:inline-flex">
            <LogOut className="h-4 w-4" />
            Logout
          </Button>
        </div>
      </header>

      <main className="lg:ml-72">
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
    </div>
  );
}

function MobileMenu({
  pathname,
  isAdmin,
  signOut
}: {
  pathname: string;
  isAdmin: boolean;
  signOut: () => Promise<void>;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Open navigation menu">
          <Menu className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="left-3 top-3 max-h-[calc(100vh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-sm translate-x-0 translate-y-0 p-4">
        <DialogHeader>
          <DialogTitle>Menu</DialogTitle>
        </DialogHeader>
        <nav className="grid max-h-[70vh] gap-4 overflow-y-auto">
          {[...navGroups, ...(isAdmin ? [{ label: "Admin", items: adminItems }] : [])].map((group) => (
            <div key={group.label}>
              <p className="mb-2 px-3 text-xs font-semibold uppercase text-muted-foreground">{group.label}</p>
              <div className="grid gap-2">
                {group.items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  return (
                    <DialogClose key={item.href} asChild>
                      <Link
                        href={item.href}
                        className={cn(
                          "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition",
                          active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-primary"
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {item.label}
                      </Link>
                    </DialogClose>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <Button variant="outline" className="mt-3 w-full justify-start" onClick={signOut}>
          <LogOut className="h-4 w-4" />
          Logout
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function SidebarLink({
  item,
  active
}: {
  item: { href: string; label: string; icon: React.ComponentType<{ className?: string }> };
  active: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition",
        active ? "bg-primary text-primary-foreground shadow-luxe" : "text-muted-foreground hover:bg-muted hover:text-primary"
      )}
    >
      <Icon className="h-4 w-4" />
      {item.label}
    </Link>
  );
}
