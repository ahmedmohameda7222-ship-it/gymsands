"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  BarChart3,
  ClipboardList,
  Dumbbell,
  Home,
  LogOut,
  Settings,
  Shield,
  Soup,
  User,
  Utensils,
  Weight
} from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/auth-provider";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/my-meal-plan", label: "My Meal Plan", icon: ClipboardList },
  { href: "/meals", label: "Meals", icon: Soup },
  { href: "/calories", label: "Calories", icon: Utensils },
  { href: "/workouts", label: "Workouts", icon: Dumbbell },
  { href: "/progress", label: "Progress", icon: BarChart3 },
  { href: "/profile", label: "Profile", icon: User }
];

const mobileNavItems = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/my-meal-plan", label: "Meal Plan", icon: ClipboardList },
  { href: "/calories", label: "Calories", icon: Utensils },
  { href: "/workouts", label: "Workouts", icon: Dumbbell },
  { href: "/progress", label: "Progress", icon: BarChart3 }
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
    <div className="min-h-screen bg-slate-50 pb-20 lg:pb-0">
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
          <Brand href="/dashboard" className="lg:hidden" />
          <div className="hidden lg:block">
            <p className="text-sm text-muted-foreground">S&S Gym private dashboard</p>
            <h1 className="text-lg font-semibold">Simple tracking for real life</h1>
          </div>
          <Button variant="outline" size="sm" onClick={signOut}>
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

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t bg-white lg:hidden">
        <div className="grid grid-cols-5">
          {mobileNavItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-medium",
                  active ? "text-primary" : "text-slate-500"
                )}
              >
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
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
