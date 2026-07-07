"use client";

import { useEffect, useState, type ReactNode } from "react";
import { CheckCircle2, Clipboard, ExternalLink, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import { InlineFeedback } from "@/components/motion";
import { addCustomFoodLog } from "@/services/database/nutrition";
import { userSafeError } from "@/lib/error-formatting";
import type { FoodLog, MealType } from "@/types";

type Draft = {
  foodName: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  mealType: MealType;
  date: string;
  quantity: string;
  servingInfo: string;
};

type Status = {
  type: "info" | "error";
  message: string;
};

const mealTypes: MealType[] = ["Breakfast", "Lunch", "Dinner", "Snack"];

function emptyDraft(date: string): Draft {
  return {
    foodName: "",
    calories: "",
    protein: "",
    carbs: "",
    fat: "",
    mealType: "Lunch",
    date,
    quantity: "1",
    servingInfo: "1 serving"
  };
}

export function ChatGptMealImportReview({
  selectedDate,
  onSaved
}: {
  selectedDate: string;
  onSaved: (log: FoodLog) => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(selectedDate));
  const [isReviewing, setIsReviewing] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    setDraft((current) => ({ ...current, date: selectedDate }));
  }, [selectedDate]);

  const prompt = buildMealEstimatePrompt(selectedDate);

  async function preparePrompt() {
    setIsPreparing(true);
    setStatus({ type: "info", message: "Prepare the estimate in ChatGPT, then paste the reviewed values here before saving." });
    try {
      await navigator.clipboard?.writeText(prompt);
      setStatus({ type: "info", message: "Prompt copied. ChatGPT can estimate the meal, but Plaivra will not save it until you approve the reviewed fields." });
    } catch {
      setStatus({ type: "info", message: "Open ChatGPT and ask it for meal name, calories, protein, carbs, fat, meal type, date, and serving size. Nothing is saved yet." });
    } finally {
      setIsPreparing(false);
      setIsReviewing(true);
    }
  }

  function openChatGpt() {
    setIsReviewing(true);
    if (typeof window !== "undefined") {
      window.open("https://chatgpt.com/", "_blank", "noopener,noreferrer");
    }
  }

  async function applyReviewedMeal() {
    if (!user?.id) {
      setStatus({ type: "error", message: "Sign in again before saving reviewed meal data." });
      return;
    }

    const validation = validateDraft(draft);
    if (validation) {
      setStatus({ type: "error", message: validation });
      return;
    }

    setIsApplying(true);
    setStatus({ type: "info", message: "Applying the reviewed meal to today's log..." });
    try {
      const saved = await addCustomFoodLog({
        user_id: user.id,
        food_item_id: null,
        user_food_item_id: null,
        log_date: draft.date,
        meal_type: draft.mealType,
        food_name: draft.foodName.trim(),
        serving_size: draft.servingInfo.trim() || "Reviewed ChatGPT estimate",
        quantity: Number(draft.quantity),
        calories: Number(draft.calories),
        protein_g: Number(draft.protein),
        carbs_g: Number(draft.carbs),
        fat_g: Number(draft.fat),
        notes: "Reviewed ChatGPT/photo/text estimate. Plaivra stores the reviewed log, not the chat itself."
      });
      onSaved(saved);
      setStatus({ type: "info", message: "Reviewed meal saved. Plaivra stores the reviewed log, not the chat itself." });
      setDraft(emptyDraft(selectedDate));
      setIsReviewing(false);
      toast({ title: "Reviewed meal saved", description: `${saved.food_name} was added to ${saved.meal_type}.` });
    } catch (error) {
      setStatus({ type: "error", message: `The imported estimate was not saved. Your log is unchanged. ${userSafeError(error)}` });
    } finally {
      setIsApplying(false);
    }
  }

  function resetReview() {
    setDraft(emptyDraft(selectedDate));
    setStatus({ type: "info", message: "The imported estimate was not saved. Your log is unchanged." });
    setIsReviewing(false);
  }

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-primary">
              <Sparkles className="h-4 w-4" />
              ChatGPT meal import
            </p>
            <h2 className="mt-2 text-lg font-semibold text-foreground">Review an AI-estimated meal before it reaches your log</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Use ChatGPT to estimate a meal from a photo or text, then review it here before saving.
            </p>
          </div>
          <div className="grid gap-2 sm:min-w-[220px]">
            <Button type="button" className="min-h-12" onClick={preparePrompt} disabled={isPreparing || isApplying}>
              {isPreparing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clipboard className="h-4 w-4" />}
              Copy ChatGPT prompt
            </Button>
            <Button type="button" variant="outline" className="min-h-12" onClick={openChatGpt} disabled={isApplying}>
              <ExternalLink className="h-4 w-4" />
              Open ChatGPT
            </Button>
          </div>
        </div>

        <InlineFeedback message={status?.message} variant={status?.type === "error" ? "error" : "info"} onClose={() => setStatus(null)} />

        <div className="rounded-[14px] border border-border/70 bg-card/70 p-3 text-sm leading-6 text-muted-foreground">
          Manual add is available when you want to correct or enter something yourself. Plaivra stores the reviewed log, not the chat itself.
        </div>

        {isReviewing ? (
          <div className="space-y-3 rounded-[16px] border border-primary/20 bg-background/60 p-3 sm:p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Reviewed estimate</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Paste or type ChatGPT's structured estimate, correct anything that looks off, then apply it.
                </p>
              </div>
              <Button type="button" variant="ghost" size="icon" className="h-12 w-12" onClick={resetReview} disabled={isApplying} aria-label="Discard reviewed estimate">
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Meal name">
                <Input className="h-12" value={draft.foodName} onChange={(event) => setDraft((current) => ({ ...current, foodName: event.target.value }))} placeholder="Chicken rice bowl" />
              </Field>
              <Field label="Meal type">
                <select value={draft.mealType} onChange={(event) => setDraft((current) => ({ ...current, mealType: event.target.value as MealType }))} className="h-12 w-full rounded-[14px] border border-input bg-card px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {mealTypes.map((type) => <option key={type} value={type}>{type === "Snack" ? "Snack" : type}</option>)}
                </select>
              </Field>
              <Field label="Date">
                <Input className="h-12" type="date" value={draft.date} onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))} />
              </Field>
              <Field label="Quantity">
                <Input className="h-12" type="number" min="0.1" step="0.1" inputMode="decimal" value={draft.quantity} onChange={(event) => setDraft((current) => ({ ...current, quantity: event.target.value }))} />
              </Field>
              <Field label="Serving">
                <Input className="h-12" value={draft.servingInfo} onChange={(event) => setDraft((current) => ({ ...current, servingInfo: event.target.value }))} placeholder="1 bowl, 350g, etc." />
              </Field>
              <Field label="Calories">
                <Input className="h-12" type="number" min="0" inputMode="decimal" value={draft.calories} onChange={(event) => setDraft((current) => ({ ...current, calories: event.target.value }))} />
              </Field>
              <Field label="Protein g">
                <Input className="h-12" type="number" min="0" inputMode="decimal" value={draft.protein} onChange={(event) => setDraft((current) => ({ ...current, protein: event.target.value }))} />
              </Field>
              <Field label="Carbs g">
                <Input className="h-12" type="number" min="0" inputMode="decimal" value={draft.carbs} onChange={(event) => setDraft((current) => ({ ...current, carbs: event.target.value }))} />
              </Field>
              <Field label="Fat g">
                <Input className="h-12" type="number" min="0" inputMode="decimal" value={draft.fat} onChange={(event) => setDraft((current) => ({ ...current, fat: event.target.value }))} />
              </Field>
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
              <p className="text-xs leading-5 text-muted-foreground">Nothing from ChatGPT is applied until you approve this reviewed estimate.</p>
              <Button type="button" className="min-h-12" onClick={applyReviewedMeal} disabled={isApplying}>
                {isApplying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {isApplying ? "Applying..." : "Apply reviewed meal"}
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function validateDraft(draft: Draft) {
  if (!draft.foodName.trim()) return "Meal name is required before saving.";
  if (!draft.date) return "Choose the log date before saving.";
  if (!Number.isFinite(Number(draft.quantity)) || Number(draft.quantity) <= 0) return "Quantity must be greater than zero.";
  for (const [label, value] of [
    ["calories", draft.calories],
    ["protein", draft.protein],
    ["carbs", draft.carbs],
    ["fat", draft.fat]
  ] as const) {
    if (!Number.isFinite(Number(value)) || Number(value) < 0) return `${label} must be zero or higher.`;
  }
  return "";
}

function buildMealEstimatePrompt(date: string) {
  return [
    "Estimate this meal for Plaivra from my photo/text/context.",
    "Return structured fields only: meal name, calories, protein_g, carbs_g, fat_g, meal type (Breakfast/Lunch/Dinner/Snack), date, quantity, and serving size.",
    `Use ${date} as the default date unless I say otherwise.`,
    "Do not assume Plaivra saved anything. I will review and approve the estimate in Plaivra before saving."
  ].join("\n");
}
