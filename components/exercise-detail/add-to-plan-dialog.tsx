"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AddToPlanActivityPayload, ExercisePrescriptionField } from "@/lib/exercise-detail/contracts";
import { useExerciseDetailTranslation } from "@/lib/i18n/exercise-detail";
import { addExerciseToPlanDay, loadExercisePlans } from "@/services/exercise-detail/client";
import type { UserWorkoutPlan } from "@/types";

type Result = { status: "added" | "duplicate"; planId: string; planName: string; dayId: string; dayName: string };

function validateField(field: ExercisePrescriptionField, raw: string | boolean | undefined) {
  if (field.type === "boolean") return field.required && typeof raw !== "boolean" ? "required" : null;
  const value = typeof raw === "string" ? raw.trim() : "";
  if (field.required && !value) return "required";
  if (!value) return null;
  if (field.type === "integer" || field.type === "number") {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || (field.type === "integer" && !Number.isInteger(parsed))) return "invalid";
    if (field.minimum !== null && parsed < field.minimum) return "invalid";
    if (field.maximum !== null && parsed > field.maximum) return "invalid";
  }
  return null;
}

export function AddToPlanDialog({
  open,
  onOpenChange,
  userId,
  activity,
  fields
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  activity: AddToPlanActivityPayload;
  fields: ExercisePrescriptionField[];
}) {
  const { dir, ed } = useExerciseDetailTranslation();
  const [plans, setPlans] = useState<UserWorkoutPlan[] | null>(null);
  const [planId, setPlanId] = useState("");
  const [dayId, setDayId] = useState("");
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const selectedPlan = useMemo(() => plans?.find((plan) => plan.id === planId) ?? null, [planId, plans]);
  const selectedDay = selectedPlan?.days.find((day) => day.id === dayId) ?? null;

  useEffect(() => {
    if (!open) return;
    let active = true;
    setError("");
    setResult(null);
    void loadExercisePlans(userId).then((next) => {
      if (!active) return;
      setPlans(next);
      const first = next[0];
      setPlanId(first?.id ?? "");
      setDayId(first?.days[0]?.id ?? "");
    }).catch(() => active && setPlans([]));
    return () => { active = false; };
  }, [open, userId]);

  function changePlan(nextPlanId: string) {
    const nextPlan = plans?.find((plan) => plan.id === nextPlanId);
    setPlanId(nextPlanId);
    setDayId(nextPlan?.days[0]?.id ?? "");
    setResult(null);
    setError("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending || !selectedPlan || !selectedDay) return;
    const invalid = fields.find((field) => validateField(field, values[field.key]));
    if (invalid) {
      setError(`${invalid.label}: ${ed("required")}`);
      return;
    }
    const prescription = Object.fromEntries(fields.flatMap((field) => {
      const value = values[field.key];
      if (value === undefined || value === "") return [];
      return [[field.key, field.type === "integer" || field.type === "number" ? Number(value) : value]];
    }));
    setPending(true);
    setError("");
    try {
      const saved = await addExerciseToPlanDay(selectedDay.id, activity, prescription);
      setResult({ status: saved.status, planId: selectedPlan.id, planName: selectedPlan.name, dayId: selectedDay.id, dayName: selectedDay.day_name });
    } catch {
      setError(ed("addFailed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent dir={dir} closeLabel={ed("close")} className="sm:max-w-xl">
        <DialogHeader><DialogTitle>{ed("addTitle")}</DialogTitle><DialogDescription>{activity.name}</DialogDescription></DialogHeader>
        {result ? (
          <div className="space-y-5" role="status">
            <div className="flex items-start gap-3 rounded-2xl bg-success/10 p-4"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" /><p className="font-medium">{result.status === "duplicate" ? ed("already", { day: result.dayName }) : ed("added", { plan: result.planName, day: result.dayName })}</p></div>
            <Button asChild className="min-h-12 w-full"><Link href={`/my-workout/plans/${result.planId}?day=${encodeURIComponent(result.dayId)}`}>{ed("viewDay")}</Link></Button>
          </div>
        ) : plans === null ? <p className="py-8 text-sm text-muted-foreground" role="status">{ed("loading")}</p> : !plans.length ? (
          <div className="space-y-4"><p className="text-sm text-muted-foreground">{ed("noPlans")}</p><Button asChild className="min-h-12 w-full"><Link href="/my-workout/plans/new">{ed("createPlan")}</Link></Button></div>
        ) : (
          <form className="space-y-5" onSubmit={submit} noValidate>
            <div className="space-y-2"><Label htmlFor="exercise-plan">{ed("choosePlan")}</Label><Select value={planId} onValueChange={changePlan}><SelectTrigger id="exercise-plan" className="min-h-12"><SelectValue placeholder={ed("choose")} /></SelectTrigger><SelectContent>{plans.map((plan) => <SelectItem key={plan.id} value={plan.id}>{plan.name}</SelectItem>)}</SelectContent></Select></div>
            {!selectedPlan?.days.length ? <div className="space-y-3 rounded-2xl bg-muted/50 p-4"><p className="text-sm text-muted-foreground">{ed("noDays")}</p><Button asChild variant="outline"><Link href={`/my-workout/plans/${selectedPlan?.id}/edit`}>{ed("editPlan")}</Link></Button></div> : (
              <div className="space-y-2"><Label htmlFor="exercise-day">{ed("chooseDay")}</Label><Select value={dayId} onValueChange={(value) => { setDayId(value); setError(""); }}><SelectTrigger id="exercise-day" className="min-h-12"><SelectValue placeholder={ed("choose")} /></SelectTrigger><SelectContent>{selectedPlan.days.map((day) => <SelectItem key={day.id} value={day.id}>{day.day_name}</SelectItem>)}</SelectContent></Select></div>
            )}
            {fields.length ? <fieldset className="space-y-4 border-t pt-5"><legend className="mb-1 font-semibold">{ed("prescription")}</legend>{fields.map((field) => <PrescriptionInput key={field.key} field={field} value={values[field.key]} onChange={(value) => { setValues((current) => ({ ...current, [field.key]: value })); setError(""); }} />)}</fieldset> : null}
            {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
            <Button type="submit" className="min-h-12 w-full" disabled={pending || !selectedDay}>{pending ? ed("adding") : ed("confirmAdd")}</Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PrescriptionInput({ field, value, onChange }: { field: ExercisePrescriptionField; value: string | boolean | undefined; onChange: (value: string | boolean) => void }) {
  const { ed } = useExerciseDetailTranslation();
  const id = `prescription-${field.key}`;
  if (field.type === "boolean") return <label htmlFor={id} className="flex min-h-12 items-center gap-3 rounded-2xl border px-4"><input id={id} type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} /><span>{field.label}</span></label>;
  if (field.options.length) return <div className="space-y-2"><Label htmlFor={id}>{field.label}{field.required ? ` · ${ed("required")}` : ""}</Label><Select value={typeof value === "string" ? value : ""} onValueChange={onChange}><SelectTrigger id={id} className="min-h-12"><SelectValue placeholder={ed("choose")} /></SelectTrigger><SelectContent>{field.options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div>;
  return <div className="space-y-2"><Label htmlFor={id}>{field.label}{field.unit ? <span className="font-normal text-muted-foreground"> <bdi>({field.unit})</bdi></span> : null}{field.required ? ` · ${ed("required")}` : ""}</Label><Input id={id} className="min-h-12" type={field.type === "text" ? "text" : "number"} step={field.type === "integer" ? 1 : "any"} min={field.minimum ?? undefined} max={field.maximum ?? undefined} required={field.required} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)} /></div>;
}
