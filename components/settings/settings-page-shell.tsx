"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/use-translation";

export type SettingsPageShellProps = {
  title: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
  children: React.ReactNode;
};

export function SettingsPageShell({ title, description, backHref = "/settings", backLabel, children }: SettingsPageShellProps) {
  const { t } = useTranslation();

  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={backHref}>
            <ArrowLeft className="h-4 w-4" />
            {backLabel ?? t("common.back")}
          </Link>
        </Button>
      </div>

      <PageHeading title={title} description={description} />

      <div className="space-y-4">{children}</div>

      <div className="h-24 lg:hidden" />
    </>
  );
}
