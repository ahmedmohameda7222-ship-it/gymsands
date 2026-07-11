"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bot, ExternalLink, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import {
  getAiPermissionSettings,
  getDefaultAiPermissionConfig,
  saveAiPermissionSettings,
  type AiPermissionConfig
} from "@/services/database/ai-permissions";

export function ChatGptExecutionCard({ mode, className }: { mode: "workout" | "meal"; className?: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [permission, setPermission] = useState<AiPermissionConfig | null>(null);
  const [permissionDialogOpen, setPermissionDialogOpen] = useState(false);
  const [isSavingPermission, setIsSavingPermission] = useState(false);

  const section = mode === "workout" ? "workouts" : "meal_plans";
  const noun = mode === "workout" ? "workout plan" : "meal plan";
  const sectionPermission = permission?.sections[section];
  const canCreate = permission?.accessMode === "full" || Boolean(sectionPermission?.write);

  useEffect(() => {
    if (!user?.id) return;
    getAiPermissionSettings(user.id).then(setPermission).catch(() => setPermission(null));
  }, [user?.id]);

  async function grantAccess() {
    if (!user?.id) return;
    setIsSavingPermission(true);
    try {
      const base = permission ?? getDefaultAiPermissionConfig();
      const next: AiPermissionConfig = {
        ...base,
        accessMode: "custom",
        sections: {
          ...base.sections,
          [section]: { read: true, write: true }
        }
      };
      await saveAiPermissionSettings(user.id, next);
      setPermission(next);
      setPermissionDialogOpen(false);
      toast({
        title: "ChatGPT access updated",
        description: `ChatGPT can now use the authorized ${mode === "workout" ? "workout" : "meal-plan"} tools.`
      });
    } catch (error) {
      toast({
        title: "Could not update ChatGPT access",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "error"
      });
    } finally {
      setIsSavingPermission(false);
    }
  }

  return (
    <Card variant="glassStrong" className={className}>
      <CardContent className="grid gap-4 p-5 md:grid-cols-[1fr_auto] md:items-center">
        <div className="flex gap-3">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-soft">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <p className="text-lg font-semibold">Create your {noun} with ChatGPT</p>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              Connect Plaivra, allow only the {mode === "workout" ? "workout" : "meal-plan"} access needed, then ask ChatGPT to create or update your plan. An authorized Plaivra tool saves successful changes directly so they appear here for tracking, editing, and correction.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row md:flex-col">
          {!canCreate ? (
            <Button type="button" variant="outline" className="min-h-12" onClick={() => setPermissionDialogOpen(true)}>
              <Settings2 className="h-4 w-4" />
              Allow {mode === "workout" ? "workout" : "meal-plan"} tools
            </Button>
          ) : (
            <Button asChild className="min-h-12">
              <a href="https://chatgpt.com/" target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
                Open ChatGPT
              </a>
            </Button>
          )}
          <Button asChild variant="ghost" className="min-h-11">
            <Link href="/settings/connections">Manage connection</Link>
          </Button>
        </div>

        <Dialog open={permissionDialogOpen} onOpenChange={setPermissionDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Allow ChatGPT to create and update {mode === "workout" ? "workouts" : "meal plans"}?</DialogTitle>
              <DialogDescription>
                Plaivra will grant read and write access only for {mode === "workout" ? "workouts" : "meal plans"}. Every request is checked server-side, and you can narrow or revoke access later.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Button type="button" className="min-h-12" onClick={() => void grantAccess()} disabled={isSavingPermission}>
                {isSavingPermission ? "Saving..." : "Allow read and write"}
              </Button>
              <Button type="button" variant="ghost" className="min-h-12" onClick={() => setPermissionDialogOpen(false)} disabled={isSavingPermission}>
                Keep current access
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
