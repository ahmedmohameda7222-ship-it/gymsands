"use client";

import Link from "next/link";
import { Bot, ExternalLink, Settings2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type ChatGptImportCardProps = {
  mode: "workout" | "meal";
  title?: string;
  description?: string;
  className?: string;
};

const requiredCopy = "ChatGPT creates the plan externally. FitLife stores, schedules, edits, and tracks the approved imported plan.";

export function ChatGptImportCard({ mode, title, description, className }: ChatGptImportCardProps) {
  const noun = mode === "workout" ? "workout plan" : "meal plan";

  function openChatGpt() {
    window.open("https://chatgpt.com", "_blank", "noopener,noreferrer");
  }

  return (
    <Card className={className}>
      <CardContent className="grid gap-4 p-5 md:grid-cols-[1fr_auto] md:items-center">
        <div className="flex gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <p className="text-lg font-semibold">{title ?? `Import your ${noun} from ChatGPT`}</p>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              {description ?? requiredCopy}
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 rounded-md border px-2 py-1">
                <ShieldCheck className="h-3.5 w-3.5" />
                External creation
              </span>
              <span className="rounded-md border px-2 py-1">FitLife imports after approval</span>
              <span className="rounded-md border px-2 py-1">Manual tools are fallback/editing</span>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row md:flex-col">
          <Button asChild className="min-h-12">
            <Link href="/settings">
              <Settings2 className="h-4 w-4" />
              Set up import
            </Link>
          </Button>
          <Button type="button" variant="outline" onClick={openChatGpt} className="min-h-12">
            <ExternalLink className="h-4 w-4" />
            Open ChatGPT
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
