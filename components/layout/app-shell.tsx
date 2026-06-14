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
  { label: "Today", items: [{ href: "/dashboard", label: "Today", icon: Home }] },
  {
    label: "Workouts",
    items: [
      { href: "/today-workout", label: "Today's Workout", icon: CalendarClock },
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
      { href: "/calories", label: "Food Log", icon: Utensils },
      { href: "/calories", label: "Calories/Macros", icon: Soup },
      { href: "/calories/custom-food-meal", label: "Food Builder", icon: ChefHat },
      { href: "/calories/weekly-overview", label: "Weekly Nutrition Summary", icon: BarChart3 }
    ]
  },
  {
    label: "Progress",
    items: [
      { href: "/progress", label: "Progress", icon: BarChart3 },
      { href: "/calories/weekly-overview", label: "Weekly Fitness Report", icon: CalendarCheck }
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
  {
    label: "Settings",
    items: [
      { href: "/profile", label: "Profile & Goals", icon: User },
      { href: "/settings", label: "Connected Apps", icon: Settings },
      { href: "/settings", label: "ChatGPT Import Setup", icon: ClipboardList },
      { href: "/settings", label: "Account Settings", icon: User }
    ]
  }
];

const mobilePrimaryItems = [
  { href: "/dashboard", label: "Today", icon: Home },
  { href: "/my-workout/plans", label: "Workouts", icon: Dumbbell },
  { href: "/calories", label: "Food", icon: Utensils },
  { href: "/progress", label: "Progress", icon: BarChart3 },
  { href: "/wellness", label: "Wellness", icon: CheckSquare },
  { href: "/settings", label: "Settings", icon: Settings }
];

const adminItems = [
  { href: "/admin", label: "Admin", icon: Shield },
  { href: "/admin/audit", label: "Audit & Quality", icon: ClipboardList },
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
        <div className="flex h-20 items-center px-6"><Brand href="/dashboard" /></div>
        <nav className="flex-1 space-y-5 overflow-y-auto px-4 pb-4">
          {navGroups.map((group) => <div key={group.label}><p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</p><div className="space-y-1">{group.items.map((item) => <SidebarLink key={`${item.href}-${item.label}`} item={item} active={pathname === item.href || pathname.startsWith(`${item.href}/`)} />)}</div></div>)}
          {isAdmin ? <div className="mt-6 border-t pt-4"><p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Admin</p>{adminItems.map((item) => <SidebarLink key={item.href} item={item} active={pathname === item.href || pathname.startsWith(`${item.href}/`)} />)}</div> : null}
        </nav>
        <div className="border-t p-4"><p className="text-sm font-semibold text-foreground">{profile?.full_name || "FitLife Hub member"}</p><p className="truncate text-xs text-muted-foreground">{profile?.email}</p><Button variant="ghost" className="mt-3 w-full justify-start" onClick={signOut}><LogOut className="h-4 w-4" />Logout</Button></div>
      </aside>
      <header className="sticky top-0 z-30 border-b bg-card/85 backdrop-blur lg:ml-72"><div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8"><div className="flex items-center gap-3 lg:hidden"><MobileMenu pathname={pathname} isAdmin={isAdmin} signOut={signOut} /><Brand href="/dashboard" /></div><div className="hidden lg:block"><p className="text-sm text-muted-foreground">FitLife Hub</p><h1 className="text-lg font-semibold">Today, workouts, food, progress</h1></div><Button variant="outline" size="sm" onClick={signOut} className="hidden lg:inline-flex"><LogOut className="h-4 w-4" />Logout</Button></div></header>
      <main className="pb-20 lg:ml-72 lg:pb-0"><motion.div key={pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: "easeOut" }} className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 sm:py-7 lg:px-8">{children}</motion.div></main>
      <MobilePrimaryNav pathname={pathname} />
    </div>
  );
}

function MobilePrimaryNav({ pathname }: { pathname: string }) { return <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t bg-card/95 px-1 pb-[max(env(safe-area-inset-bottom),0.25rem)] pt-1 shadow-luxe backdrop-blur lg:hidden">{mobilePrimaryItems.map((item) => { const Icon = item.icon; const active = pathname === item.href || pathname.startsWith(`${item.href}/`); return <Link key={item.href} href={item.href} className={cn("flex min-h-14 flex-col items-center justify-center gap-1 rounded-md px-1 text-[11px] font-medium transition", active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-primary")}><Icon className="h-4 w-4" /><span className="truncate">{item.label}</span></Link>; })}</nav>; }

function MobileMenu({ pathname, isAdmin, signOut }: { pathname: string; isAdmin: boolean; signOut: () => Promise<void> }) { return <Dialog><DialogTrigger asChild><Button variant="outline" size="icon" aria-label="Open navigation menu"><Menu className="h-5 w-5" /></Button></DialogTrigger><DialogContent className="left-3 top-3 max-h-[calc(100vh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-sm translate-x-0 translate-y-0 p-4"><DialogHeader><DialogTitle>Navigation</DialogTitle></DialogHeader><div className="max-h-[calc(100vh-7rem)] overflow-y-auto pr-1"><div className="space-y-5">{navGroups.map((group) => <div key={group.label}><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</p><div className="space-y-1">{group.items.map((item) => <DialogClose key={`${item.href}-${item.label}`} asChild><SidebarLink item={item} active={pathname === item.href || pathname.startsWith(`${item.href}/`)} mobile /></DialogClose>)}</div></div>)}{isAdmin ? <div className="border-t pt-4"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Admin</p>{adminItems.map((item) => <DialogClose key={item.href} asChild><SidebarLink item={item} active={pathname === item.href || pathname.startsWith(`${item.href}/`)} mobile /></DialogClose>)}</div> : null}<Button variant="ghost" className="w-full justify-start" onClick={signOut}><LogOut className="h-4 w-4" />Logout</Button></div></div></DialogContent></Dialog>; }

function SidebarLink({ item, active, mobile = false }: { item: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }; active: boolean; mobile?: boolean }) { const Icon = item.icon; return <Link href={item.href} className={cn("flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition", active ? "bg-primary text-primary-foreground shadow-soft" : "text-muted-foreground hover:bg-muted hover:text-primary", mobile && "py-3")}><Icon className="h-4 w-4 shrink-0" /><span>{item.label}</span></Link>; }
