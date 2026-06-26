"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type SettingsRow = {
  icon: LucideIcon;
  title: string;
  detail: string;
  href: string;
  action: string;
};

export function SettingsSectionCard({
  title,
  description,
  rows
}: {
  title: string;
  description?: string;
  rows: SettingsRow[];
}) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((row) => {
          const Icon = row.icon;
          return (
            <Link
              key={row.title}
              href={row.href}
              className="solid-row group flex min-h-[56px] items-center justify-between gap-3 p-3 transition-colors hover:border-primary/40 hover:bg-muted/45"
            >
              <span className="flex min-w-0 items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold text-foreground">
                    {row.title}
                  </span>
                  <span className="mt-1 block text-sm leading-5 text-muted-foreground">
                    {row.detail}
                  </span>
                </span>
              </span>
              <span className="shrink-0 rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground group-hover:border-primary/40 group-hover:text-primary">
                {row.action}
              </span>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
