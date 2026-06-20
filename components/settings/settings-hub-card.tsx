"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export type SettingsHubCardProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  href: string;
};

export function SettingsHubCard({ icon: Icon, title, description, href }: SettingsHubCardProps) {
  return (
    <Link
      href={href}
      className="group flex min-h-[72px] items-center gap-4 rounded-2xl border border-border/70 bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/45"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-foreground">{title}</span>
        <span className="mt-0.5 block text-sm leading-5 text-muted-foreground">{description}</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
    </Link>
  );
}
