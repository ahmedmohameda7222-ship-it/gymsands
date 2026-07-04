"use client";

import { useState, useCallback, useEffect, useMemo, type ReactNode } from "react";
import { Ban, CheckCircle2, Eye, EyeOff, KeyRound, Loader2, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import {
  getAiPermissionSettings,
  saveAiPermissionSettings,
  getDefaultAiPermissionConfig,
  type AiPermissionConfig,
  ALL_AI_PERMISSION_SECTIONS
} from "@/services/database/ai-permissions";
import { AI_PERMISSION_SECTION_DETAILS, FULL_ACCESS_WARNING } from "@/lib/mcp/permission-presentation";
import { userSafeError } from "@/lib/error-formatting";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { InlineFeedback } from "@/components/motion";

const permissionExamples: Record<string, string> = {
  workouts: "Example: Review today’s workout or save an approved set change.",
  nutrition: "Example: Review today’s food log or add an approved meal.",
  meal_plans: "Example: Suggest a cheaper meal and save only the version you approve.",
  hydration: "Example: Check today’s water progress or log an amount you confirm.",
  wellness: "Example: Review saved readiness or update a habit you approve.",
  progress: "Example: Summarize progress or save a measurement you provide.",
  profile: "Example: Use your goals to tailor advice or update an approved preference.",
  settings: "Example: Review targets or save an approved target change."
};

export function AiPermissionsCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { dialog: confirmDialog, ask: confirmAsk } = useConfirm();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [config, setConfig] = useState<AiPermissionConfig>(() => getDefaultAiPermissionConfig());
  const [hasSavedSettings, setHasSavedSettings] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    setIsLoading(true);
    try {
      const settings = await getAiPermissionSettings(user.id);
      setConfig(settings ?? getDefaultAiPermissionConfig());
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
    if (!user?.id) return;
    setIsSaving(true);
    try {
      await saveAiPermissionSettings(user.id, config);
      toast({ title: "AI Permissions saved", description: "Your AI access settings have been updated." });
      setHasSavedSettings(true);
      setSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    } catch (error) {
      toast({ title: "Could not save", description: userSafeError(error) });
    } finally {
      setIsSaving(false);
    }
  }

  function toggleRead(section: (typeof ALL_AI_PERMISSION_SECTIONS)[number]) {
    const enabled = config.sections[section].read;
    const apply = () => setConfig((current) => ({
      ...current,
      sections: {
        ...current.sections,
        [section]: enabled ? { read: false, write: false } : { ...current.sections[section], read: true }
      }
    }));
    if (!enabled) return apply();
    confirmAsk({
      title: `Remove ChatGPT read access for ${AI_PERMISSION_SECTION_DETAILS[section].label}?`,
      description: "ChatGPT will no longer be able to view this section. Write access will also be removed.",
      confirmLabel: "Remove access",
      variant: "destructive",
      onConfirm: apply
    });
  }

  function toggleWrite(section: (typeof ALL_AI_PERMISSION_SECTIONS)[number]) {
    const enabled = config.sections[section].write;
    const apply = () => setConfig((current) => ({
      ...current,
      sections: {
        ...current.sections,
        [section]: enabled
          ? { ...current.sections[section], write: false }
          : { read: true, write: true }
      }
    }));
    if (!enabled) return apply();
    confirmAsk({
      title: `Remove ChatGPT write access for ${AI_PERMISSION_SECTION_DETAILS[section].label}?`,
      description: "ChatGPT will no longer be able to save changes in this section. Read access will remain enabled.",
      confirmLabel: "Remove write access",
      variant: "destructive",
      onConfirm: apply
    });
  }

  const summary = useMemo(() => {
    const labels = ALL_AI_PERMISSION_SECTIONS.map((section) => ({ section, label: AI_PERMISSION_SECTION_DETAILS[section].label }));
    if (config.accessMode === "full") return { view: labels.map((item) => item.label), change: labels.map((item) => item.label), denied: [] as string[] };
    return {
      view: labels.filter(({ section }) => config.sections[section].read).map((item) => item.label),
      change: labels.filter(({ section }) => config.sections[section].write).map((item) => item.label),
      denied: labels.filter(({ section }) => !config.sections[section].read && !config.sections[section].write).map((item) => item.label)
    };
  }, [config]);

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
      {confirmDialog}
      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-5 w-5 text-primary" /> AI Permissions
          </CardTitle>
          <CardDescription>Choose what ChatGPT can see or change after you connect Plaivra. Nothing is shared until you save a choice.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Mode selection */}
          <div className="grid gap-3">
            <button
              type="button"
              onClick={() => setConfig((current) => ({ ...current, accessMode: "full" }))}
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
                <p className="font-semibold">All Plaivra areas</p>
                <p className={`mt-1 text-sm leading-6 ${config.accessMode === "full" ? "text-foreground" : "text-muted-foreground"}`}>
                  {FULL_ACCESS_WARNING}
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setConfig((current) => ({ ...current, accessMode: "custom" }))}
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
                <p className="font-semibold">Choose specific areas</p>
                <p className={`mt-1 text-sm leading-6 ${config.accessMode === "custom" ? "text-foreground" : "text-muted-foreground"}`}>
                  Choose only the areas and actions needed for how you use ChatGPT.
                </p>
              </div>
            </button>
          </div>

          <div className="grid gap-3 rounded-[16px] border border-border/70 bg-muted/20 p-4 sm:grid-cols-2">
            <div className="flex gap-3"><Eye className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><p className="font-semibold text-foreground">View only</p><p className="mt-1 text-sm leading-6 text-muted-foreground">ChatGPT can read this area and suggest changes in chat, but cannot save changes.</p></div></div>
            <div className="flex gap-3"><KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><p className="font-semibold text-foreground">Change</p><p className="mt-1 text-sm leading-6 text-muted-foreground">ChatGPT can save changes you explicitly approve. Change automatically includes View for that area only.</p></div></div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3" aria-label="Selected permission summary">
            <PermissionSummary title="Can view" values={summary.view} icon={<Eye className="h-4 w-4" />} />
            <PermissionSummary title="Can change" values={summary.change} icon={<KeyRound className="h-4 w-4" />} />
            <PermissionSummary title="Not allowed" values={summary.denied} icon={<Ban className="h-4 w-4" />} />
          </div>

          {/* Custom section toggles */}
          {config.accessMode === "custom" ? (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-foreground">Choose what ChatGPT can do</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {ALL_AI_PERMISSION_SECTIONS.map((section) => {
                  const perms = config.sections[section];
                  const details = AI_PERMISSION_SECTION_DETAILS[section];
                  return (
                    <div key={section} className="rounded-2xl border bg-card p-4 space-y-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold">{details.label}</p>
                          {details.sensitive ? <p className="mt-1 text-xs font-medium text-amber-700">Contains sensitive fitness or wellness data</p> : null}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => toggleRead(section)}
                            aria-pressed={perms.read}
                            className={`inline-flex min-h-11 items-center gap-1 rounded-xl border-2 px-3 py-2 text-xs font-semibold transition ${
                              perms.read
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border bg-muted text-foreground"
                            }`}
                          >
                            {perms.read ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                            View {perms.read ? "ON" : "OFF"}
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleWrite(section)}
                            aria-pressed={perms.write}
                            className={`inline-flex min-h-11 items-center gap-1 rounded-xl border-2 px-3 py-2 text-xs font-semibold transition ${
                              perms.write
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border bg-muted text-foreground"
                            }`}
                          >
                            <KeyRound className="h-3 w-3" />
                            Change {perms.write ? "ON" : "OFF"}
                          </button>
                        </div>
                      </div>
                      <div className="space-y-1 text-xs leading-5 text-muted-foreground">
                        <p><span className="font-semibold text-foreground">View:</span> {details.readDescription}</p>
                        <p><span className="font-semibold text-foreground">Make changes:</span> {details.writeDescription}</p>
                      </div>
                      <p className="rounded-[10px] bg-muted/50 p-2 text-xs leading-5 text-foreground">{permissionExamples[section]}</p>
                      {perms.write ? (
                        <p className="text-xs text-muted-foreground">To make changes, ChatGPT also needs to view this area.</p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Trust message */}
          <p className="text-sm text-muted-foreground">
            You can change these choices at any time. ChatGPT cannot use a Plaivra area unless you have allowed it here.
          </p>

          {!hasSavedSettings ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Review and save your choices before connecting ChatGPT. If you change them later, reconnect ChatGPT so the new choices take effect.
            </p>
          ) : null}

          <InlineFeedback
            message={hasSavedSettings ? `Permissions saved${savedAt ? ` at ${savedAt}` : ""}. These selections stay visible after refresh. Reconnect ChatGPT after changing permissions so the connection uses the latest choices.` : ""}
            onClose={() => {}}
          />

          {/* Save button */}
          <div className="flex justify-end">
            <Button onClick={() => void handleSave()} disabled={isSaving} className="min-h-12">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {isSaving ? "Saving..." : "Save permissions"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PermissionSummary({ title, values, icon }: { title: string; values: string[]; icon: ReactNode }) {
  return (
    <div className="rounded-[14px] border border-border/70 bg-card p-3">
      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">{icon}{title}</p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{values.length ? values.join(", ") : "None"}</p>
    </div>
  );
}
