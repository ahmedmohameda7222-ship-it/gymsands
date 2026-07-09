"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type SettingsHubCardProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  href: string;
  badge?: {
    label: string;
    variant?: "default" | "secondary" | "outline" | "success" | "warning" | "destructive";
  };
};

export function SettingsHubCard({ icon: Icon, title, description, href, badge }: SettingsHubCardProps) {
  return (
    <Link
      href={href}
      className="solid-row group flex min-h-[72px] items-center gap-4 p-4 transition-colors hover:border-primary/40 hover:bg-muted/45"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="block font-semibold text-foreground">{title}</span>
          {badge ? <Badge variant={badge.variant ?? "outline"}>{badge.label}</Badge> : null}
        </span>
        <span className="mt-0.5 block text-sm leading-5 text-muted-foreground">{description}</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
    </Link>
  );
}
