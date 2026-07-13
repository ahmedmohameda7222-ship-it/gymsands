"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Dumbbell, Home, Plus, Utensils } from "lucide-react";
import { OpenAiBlossom } from "@/components/brand/openai-blossom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useQuickChatGpt } from "@/components/ai/quick-chatgpt-provider";
import { useUserSettings } from "@/lib/settings/user-settings-context";
import { useTodayTranslation } from "@/lib/i18n/today";
import { isMobileRouteActive } from "@/lib/navigation/mobile-nav";
import { cn } from "@/lib/utils";

const quickLogRoutes = {
  water: "/hydration",
  meal: "/calories?view=day",
  weight: "/progress",
  workout: "/my-workout/plans",
  progress: "/progress",
  sleep: "/sleep-recovery",
  supplements: "/supplements",
  wellness: "/wellness"
} as const;

const quickLogLabels = { water: "water", meal: "food", weight: "weight", workout: "workout", progress: "progress", sleep: "sleep", supplements: "supplements", wellness: "wellness" } as const;

export function MobileFloatingNav({ pathname }: { pathname: string }) {
  const { tt, dir } = useTodayTranslation();
  const { settings } = useUserSettings();
  const { openPrompts, isOpen } = useQuickChatGpt();
  const params = useSearchParams();
  const visibleQuickLogs = pathname === "/calories"
    ? [...settings.quickLogSections].sort((a, b) => priority(a) - priority(b))
    : settings.quickLogSections;
  const selectedDate = params.get("date");
  function quickHref(section: keyof typeof quickLogRoutes) {
    if (pathname === "/calories" && section === "meal") return selectedDate ? `/calories?date=${encodeURIComponent(selectedDate)}&view=day` : "/calories?view=day";
    return quickLogRoutes[section];
  }
  return (
    <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+var(--mobile-nav-bottom-offset))] z-[80] lg:hidden" dir={dir} data-mobile-floating-nav>
      <nav className="relative grid h-[var(--mobile-nav-height)] grid-cols-5 items-stretch rounded-[24px] border border-border/80 bg-card/92 px-1 shadow-[var(--shadow-floating)] backdrop-blur-md" aria-label={tt("primaryMobileNavigation")}>
        <RouteItem href="/dashboard" label={tt("today")} icon={<Home className="h-5 w-5" />} active={isMobileRouteActive(pathname, "today")} />
        <RouteItem href="/my-workout/plans" label={tt("train")} icon={<Dumbbell className="h-5 w-5" />} active={isMobileRouteActive(pathname, "train")} />
        <Dialog>
          <DialogTrigger asChild><button type="button" aria-label={tt("quickLog")} className="relative flex min-h-12 flex-col items-center justify-end gap-1 pb-2 text-[10px] font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="absolute -top-4 flex h-14 w-14 items-center justify-center rounded-full border-4 border-[var(--app-bg)] bg-primary text-primary-foreground shadow-[var(--shadow-floating)]"><Plus className="h-6 w-6" /></span><span>{tt("quickLog")}</span></button></DialogTrigger>
          <DialogContent variant="glass" className="inset-x-0 bottom-0 left-0 top-auto max-h-[85dvh] w-full max-w-full translate-x-0 translate-y-0 rounded-b-none rounded-t-[24px] p-0">
            <DialogHeader className="border-b border-border/70 px-5 py-4 text-start"><DialogTitle>{tt("quickLog")}</DialogTitle></DialogHeader>
            <div className="grid gap-2 p-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
              {visibleQuickLogs.map((section) => <DialogClose key={section} asChild><Link href={quickHref(section)} className="flex min-h-12 items-center rounded-[14px] border border-border/70 bg-card px-3 text-sm font-semibold">{tt(quickLogLabels[section])}</Link></DialogClose>)}
              {!visibleQuickLogs.length ? <div className="space-y-3 p-3 text-center"><p className="text-sm text-muted-foreground">{tt("noQuickLogs")}</p><DialogClose asChild><Button asChild variant="outline"><Link href="/settings/preferences">{tt("openPreferences")}</Link></Button></DialogClose></div> : null}
            </div>
          </DialogContent>
        </Dialog>
        <RouteItem href="/calories" label={tt("eat")} icon={<Utensils className="h-5 w-5" />} active={isMobileRouteActive(pathname, "eat")} />
        <button type="button" aria-pressed={isOpen} onClick={() => openPrompts()} className={cn("flex min-h-12 flex-col items-center justify-center gap-1 rounded-[18px] px-1 text-[10px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", isOpen ? "text-primary" : "text-muted-foreground")}><OpenAiBlossom className="h-5 w-5" /><span className="max-w-full truncate">{tt("chatGpt")}</span></button>
      </nav>
    </div>
  );
}
function priority(section: string) { return section === "meal" ? 0 : section === "water" ? 1 : 2; }
function RouteItem({ href, label, icon, active }: { href: string; label: string; icon: React.ReactNode; active: boolean }) { return <Link href={href} aria-current={active ? "page" : undefined} className={cn("flex min-h-12 flex-col items-center justify-center gap-1 rounded-[18px] px-1 text-[10px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active ? "text-primary" : "text-muted-foreground hover:text-primary")}>{icon}<span className="max-w-full truncate">{label}</span></Link>; }
