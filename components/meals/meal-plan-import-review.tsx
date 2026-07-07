"use client";

import { useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, Loader2, PlusCircle, Sparkles, Trash2 } from "lucide-react";
import { AiActionRequestDialog } from "@/components/ai/ai-action-request-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineFeedback } from "@/components/motion";
import { useAuth } from "@/components/auth/auth-provider";
import {
  createDirectMealPlanItem,
  deleteDirectMealPlanItem,
  normalizeMealPlanType
} from "@/services/database/meal-plan";
import { userSafeError } from "@/lib/error-formatting";
import type { MealPlanItem, MealType } from "@/types";

type PlanDraftRow = {
  id: string;
  date: string;
  mealType: MealType;
  foodName: string;
  quantity: string;
  servingInfo: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  notes: string;
};

type Status = {
  type: "info" | "error";
  message: string;
};

const mealTypes: MealType[] = ["Breakfast", "Lunch", "Dinner", "Snack"];

function createDraftRow(date: string): PlanDraftRow {
  return {
    id: crypto.randomUUID(),
    date,
    mealType: "Breakfast",
    foodName: "",
    quantity: "1",
    servingInfo: "1 serving",
    calories: "",
    protein: "",
    carbs: "",
    fat: "",
    notes: ""
  };
}

export function MealPlanImportReview({
  defaultDate,
  requestContext,
  onApplied
}: {
  defaultDate: string;
  requestContext: Record<string, unknown>;
  onApplied: (items: MealPlanItem[]) => void;
}) {
  const { user } = useAuth();
  const [rows, setRows] = useState<PlanDraftRow[]>(() => [createDraftRow(defaultDate)]);
  const [isReviewing, setIsReviewing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);

  const visibleRows = useMemo(() => rows.length ? rows : [createDraftRow(defaultDate)], [defaultDate, rows]);

  function updateRow(id: string, patch: Partial<PlanDraftRow>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setRows((current) => [...current, createDraftRow(defaultDate)]);
    setIsReviewing(true);
  }

  function removeRow(id: string) {
    setRows((current) => current.length > 1 ? current.filter((row) => row.id !== id) : [createDraftRow(defaultDate)]);
  }

  async function applyReviewedPlan() {
    if (!user?.id) {
      setStatus({ type: "error", message: "Sign in again before saving reviewed meal-plan data." });
      return;
    }

    const validation = validateRows(visibleRows);
    if (validation) {
      setStatus({ type: "error", message: validation });
      return;
    }

    setIsApplying(true);
    setStatus({ type: "info", message: "Applying reviewed meal-plan rows..." });
    const created: MealPlanItem[] = [];
    try {
      for (const row of visibleRows) {
        const item = await createDirectMealPlanItem({
          userId: user.id,
          date: row.date,
          mealType: row.mealType,
          foodName: row.foodName,
          quantity: Number(row.quantity),
          servingInfo: row.servingInfo,
          calories: Number(row.calories),
          protein: Number(row.protein),
          carbs: Number(row.carbs),
          fat: Number(row.fat),
          notes: row.notes.trim() || "Reviewed ChatGPT meal-plan import."
        });
        created.push(item);
      }
      onApplied(created);
      setRows([createDraftRow(defaultDate)]);
      setIsReviewing(false);
      setStatus({ type: "info", message: "Reviewed plan saved. Manual edits are still available for corrections." });
    } catch (error) {
      const rollbacks = await Promise.allSettled(created.map((item) => deleteDirectMealPlanItem(item)));
      const rollbackFailed = rollbacks.some((result) => result.status === "rejected");
      setStatus({
        type: "error",
        message: rollbackFailed
          ? `Plan was not fully applied. Review the current plan before retrying. ${userSafeError(error)}`
          : `Plan was not applied. Your current meals are unchanged. ${userSafeError(error)}`
      });
    } finally {
      setIsApplying(false);
    }
  }

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-primary">
              <Sparkles className="h-4 w-4" />
              ChatGPT meal-plan import
            </p>
            <h2 className="mt-2 text-lg font-semibold text-foreground">Import, review, then save your meal plan</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Import a meal plan from ChatGPT, review it, then save it to Plaivra. Nothing is saved until you approve the reviewed plan.
            </p>
          </div>
          <div className="grid gap-2 lg:min-w-[240px] [&_button]:min-h-12">
            <AiActionRequestDialog
              actions={[{ type: "build_meal_plan", label: "Prepare ChatGPT request", description: "Use your profile, preferences, and schedule to draft a meal plan for review." }]}
              sourceType="meal_plan_route"
              context={requestContext}
              permissionSection="meal_plans"
              title="Import a meal plan with ChatGPT"
              buttonVariant="default"
              className="grid"
            />
            <Button type="button" variant="outline" className="min-h-12" onClick={() => setIsReviewing((current) => !current)}>
              {isReviewing ? "Hide review rows" : "Review structured plan"}
            </Button>
          </div>
        </div>

        <InlineFeedback message={status?.message} variant={status?.type === "error" ? "error" : "info"} onClose={() => setStatus(null)} />

        <div className="rounded-[14px] border border-border/70 bg-card/70 p-3 text-sm leading-6 text-muted-foreground">
          Manual edits are available for corrections. Food Hub, saved meals, and day/week editing remain fallback control paths.
        </div>

        {isReviewing ? (
          <div className="space-y-3 rounded-[16px] border border-primary/20 bg-background/60 p-3 sm:p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold">Reviewed plan rows</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Paste ChatGPT's structured meals here and correct day, meal type, quantity, and macros before applying.</p>
              </div>
              <Button type="button" variant="outline" className="min-h-12" onClick={addRow} disabled={isApplying}>
                <PlusCircle className="h-4 w-4" />
                Add row
              </Button>
            </div>

            <div className="space-y-3">
              {visibleRows.map((row, index) => (
                <div key={row.id} className="rounded-[14px] border border-border/70 bg-card p-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold">Meal {index + 1}</p>
                    <Button type="button" variant="ghost" size="icon" className="h-12 w-12 text-destructive hover:text-destructive" onClick={() => removeRow(row.id)} disabled={isApplying} aria-label="Remove reviewed meal row">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <Field label="Food name">
                      <Input className="h-12" value={row.foodName} onChange={(event) => updateRow(row.id, { foodName: event.target.value })} placeholder="Greek yogurt bowl" />
                    </Field>
                    <Field label="Date">
                      <Input className="h-12" type="date" value={row.date} onChange={(event) => updateRow(row.id, { date: event.target.value })} />
                    </Field>
                    <Field label="Meal type">
                      <select value={row.mealType} onChange={(event) => updateRow(row.id, { mealType: normalizeMealPlanType(event.target.value) })} className="h-12 w-full rounded-[14px] border border-input bg-card px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        {mealTypes.map((type) => <option key={type} value={type}>{type === "Snack" ? "Snack" : type}</option>)}
                      </select>
                    </Field>
                    <Field label="Quantity">
                      <Input className="h-12" type="number" min="0.1" step="0.1" inputMode="decimal" value={row.quantity} onChange={(event) => updateRow(row.id, { quantity: event.target.value })} />
                    </Field>
                    <Field label="Serving">
                      <Input className="h-12" value={row.servingInfo} onChange={(event) => updateRow(row.id, { servingInfo: event.target.value })} placeholder="1 serving" />
                    </Field>
                    <Field label="Calories">
                      <Input className="h-12" type="number" min="0" inputMode="decimal" value={row.calories} onChange={(event) => updateRow(row.id, { calories: event.target.value })} />
                    </Field>
                    <Field label="Protein g">
                      <Input className="h-12" type="number" min="0" inputMode="decimal" value={row.protein} onChange={(event) => updateRow(row.id, { protein: event.target.value })} />
                    </Field>
                    <Field label="Carbs g">
                      <Input className="h-12" type="number" min="0" inputMode="decimal" value={row.carbs} onChange={(event) => updateRow(row.id, { carbs: event.target.value })} />
                    </Field>
                    <Field label="Fat g">
                      <Input className="h-12" type="number" min="0" inputMode="decimal" value={row.fat} onChange={(event) => updateRow(row.id, { fat: event.target.value })} />
                    </Field>
                    <Field label="Notes">
                      <Input className="h-12" value={row.notes} onChange={(event) => updateRow(row.id, { notes: event.target.value })} placeholder="Optional correction note" />
                    </Field>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
              <p className="text-xs leading-5 text-muted-foreground">No imported or AI-generated plan data is saved until you approve these reviewed rows.</p>
              <Button type="button" className="min-h-12" onClick={applyReviewedPlan} disabled={isApplying}>
                {isApplying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {isApplying ? "Applying..." : "Apply reviewed plan"}
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

function validateRows(rows: PlanDraftRow[]) {
  for (const [index, row] of rows.entries()) {
    const label = `Meal ${index + 1}`;
    if (!row.foodName.trim()) return `${label}: food name is required.`;
    if (!row.date) return `${label}: date is required.`;
    if (!Number.isFinite(Number(row.quantity)) || Number(row.quantity) <= 0) return `${label}: quantity must be greater than zero.`;
    for (const [field, value] of [
      ["calories", row.calories],
      ["protein", row.protein],
      ["carbs", row.carbs],
      ["fat", row.fat]
    ] as const) {
      if (!Number.isFinite(Number(value)) || Number(value) < 0) return `${label}: ${field} must be zero or higher.`;
    }
  }
  return "";
}
