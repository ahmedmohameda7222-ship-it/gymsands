"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  BarChart3,
  CalendarClock,
  ClipboardList,
  CalendarCheck,
  ChefHat,
  Dumbbell,
  History,
  Home,
  LogOut,
  Menu,
  Settings,
  Shield,
  Soup,
  User,
  Utensils,
  Weight
} from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useAuth } from "@/components/auth/auth-provider";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/today-workout", label: "Today's Workout", icon: CalendarClock },
  { href: "/my-meal-plan", label: "My Meal Plan", icon: ClipboardList },
  { href: "/meals", label: "Meals", icon: Soup },
  { href: "/calories", label: "Calories", icon: Utensils },
  { href: "/calories/weekly-overview", label: "Weekly Overview", icon: BarChart3 },
  { href: "/calories/custom-food-meal", label: "Custom Food / Meal", icon: ChefHat },
  { href: "/workouts", label: "Workouts", icon: Dumbbell },
  { href: "/my-workout", label: "My Workout", icon: CalendarCheck },
  { href: "/workout-history", label: "Workout History", icon: History },
  { href: "/progress", label: "Progress", icon: BarChart3 },
  { href: "/profile", label: "Profile", icon: User }
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
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 border-r bg-white lg:flex lg:flex-col">
        <div className="flex h-20 items-center px-6">
          <Brand href="/dashboard" />
        </div>
        <nav className="flex-1 space-y-1 px-4">
          {navItems.map((item) => (
            <SidebarLink key={item.href} item={item} active={pathname === item.href || pathname.startsWith(`${item.href}/`)} />
          ))}
          {isAdmin ? (
            <div className="mt-6 border-t pt-4">
              <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Admin</p>
              {adminItems.map((item) => (
                <SidebarLink key={item.href} item={item} active={pathname === item.href || pathname.startsWith(`${item.href}/`)} />
              ))}
            </div>
          ) : null}
        </nav>
        <div className="border-t p-4">
          <p className="text-sm font-semibold">{profile?.full_name || "S&S Gym member"}</p>
          <p className="truncate text-xs text-muted-foreground">{profile?.email}</p>
          <Button variant="ghost" className="mt-3 w-full justify-start" onClick={signOut}>
            <LogOut className="h-4 w-4" />
            Logout
          </Button>
        </div>
      </aside>

      <header className="sticky top-0 z-30 border-b bg-white/90 backdrop-blur lg:ml-72">
        <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 lg:hidden">
            <MobileMenu pathname={pathname} isAdmin={isAdmin} signOut={signOut} />
            <Brand href="/dashboard" />
          </div>
          <div className="hidden lg:block">
            <p className="text-sm text-muted-foreground">S&S Gym</p>
            <h1 className="text-lg font-semibold">Training, meals, and progress</h1>
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
  const items = isAdmin ? [...navItems, ...adminItems] : navItems;
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
        <nav className="grid gap-2">
          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <DialogClose key={item.href} asChild>
                <Link
                  href={item.href}
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition",
                    active ? "bg-blue-50 text-primary" : "text-slate-700 hover:bg-blue-50 hover:text-primary"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              </DialogClose>
            );
          })}
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
        active ? "bg-blue-50 text-primary" : "text-slate-600 hover:bg-blue-50 hover:text-primary"
      )}
    >
      <Icon className="h-4 w-4" />
      {item.label}
    </Link>
  );
}
