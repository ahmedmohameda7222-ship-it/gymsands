"use client";

import { useState, useCallback, useEffect } from "react";
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import {
  getAiPermissionSettings,
  saveAiPermissionSettings,
  type AiPermissionConfig,
  ALL_AI_PERMISSION_SECTIONS
} from "@/services/database/ai-permissions";

export function AiPermissionsCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [config, setConfig] = useState<AiPermissionConfig | null>(null);
  const [hasSavedSettings, setHasSavedSettings] = useState(false);

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    setIsLoading(true);
    try {
      const settings = await getAiPermissionSettings(user.id);
      setConfig(settings);
      setHasSavedSettings(Boolean(settings));
    } catch (error) {
      console.warn("Could not load AI permissions:", error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleSave() {
    if (!user?.id || !config) return;
    setIsSaving(true);
    try {
      await saveAiPermissionSettings(user.id, config);
      toast({ title: "AI Permissions saved", description: "Your AI access settings have been updated." });
      setHasSavedSettings(true);
    } catch (error) {
      toast({ title: "Could not save", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <Card className="border-border/70">
        <CardContent className="flex items-center gap-3 py-6">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading AI permissions...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-5 w-5 text-primary" /> AI Permissions
          </CardTitle>
          <CardDescription>Choose what AI can read and manage in your FitLife account.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Mode selection */}
          <div className="grid gap-3">
            <button
              type="button"
              onClick={() => setConfig((c) => (c ? { ...c, accessMode: "full" } : c))}
              className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition ${
                config?.accessMode === "full"
                  ? "border-primary bg-primary/10 text-primary shadow-soft"
                  : "bg-card text-foreground hover:border-primary/40 hover:bg-muted/45"
              }`}
            >
              <div className="mt-0.5">
                {config?.accessMode === "full" ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0" />
                ) : (
                  <div className="h-5 w-5 rounded-full border-2 border-muted-foreground" />
                )}
              </div>
              <div>
                <p className="font-semibold">Full AI Access</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Give AI full permission to manage your FitLife account, including workouts, nutrition, meal plans, hydration, wellness, progress, and profile data.
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setConfig((c) => (c ? { ...c, accessMode: "custom" } : c))}
              className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition ${
                config?.accessMode === "custom"
                  ? "border-primary bg-primary/10 text-primary shadow-soft"
                  : "bg-card text-foreground hover:border-primary/40 hover:bg-muted/45"
              }`}
            >
              <div className="mt-0.5">
                {config?.accessMode === "custom" ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0" />
                ) : (
                  <div className="h-5 w-5 rounded-full border-2 border-muted-foreground" />
                )}
              </div>
              <div>
                <p className="font-semibold">Custom AI Access</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Choose exactly which sections AI can read or update.
                </p>
              </div>
            </button>
          </div>

          {/* Custom section toggles */}
          {config?.accessMode === "custom" ? (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Sections</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {ALL_AI_PERMISSION_SECTIONS.map((section) => {
                  const perms = config.sections[section];
                  return (
                    <div key={section} className="rounded-2xl border bg-card p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold capitalize">{section.replace("_", " ")}</p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setConfig((c) =>
                                c
                                  ? {
                                      ...c,
                                      sections: {
                                        ...c.sections,
                                        [section]: { ...c.sections[section], read: !c.sections[section].read }
                                      }
                                    }
                                  : c
                              )
                            }
                            className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium transition ${
                              perms.read
                                ? "border-primary bg-primary/10 text-primary"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {perms.read ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                            Read
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setConfig((c) => {
                                if (!c) return c;
                                const nextWrite = !c.sections[section].write;
                                return {
                                  ...c,
                                  sections: {
                                    ...c.sections,
                                    [section]: {
                                      read: nextWrite ? true : c.sections[section].read,
                                      write: nextWrite
                                    }
                                  }
                                };
                              })
                            }
                            className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium transition ${
                              perms.write
                                ? "border-primary bg-primary/10 text-primary"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            <KeyRound className="h-3 w-3" />
                            Write
                          </button>
                        </div>
                      </div>
                      {perms.write ? (
                        <p className="text-xs text-muted-foreground">Write access includes read access for this section.</p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Trust message */}
          <p className="text-sm text-muted-foreground">
            You can change or revoke AI access anytime from Settings. AI can only access what you allow.
          </p>

          {!hasSavedSettings ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Please review and save your AI permissions. Older connections may need to be regenerated after updating permissions.
            </p>
          ) : null}

          {/* Save button */}
          <div className="flex justify-end">
            <Button onClick={() => void handleSave()} disabled={isSaving || !config} className="min-h-12">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {isSaving ? "Saving..." : "Save AI Permissions"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
