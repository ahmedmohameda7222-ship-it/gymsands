"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Zap } from "lucide-react";
import type { MealType, FoodLog } from "@/types";
import { quickAddManualFoodLog } from "@/services/meals/food-logging-speed";
import { useToast } from "@/components/ui/toaster";
import { userSafeError } from "@/lib/error-formatting";
import { Select } from "@/components/ui/select-field";

type QuickAddFoodDialogProps = {
  userId: string | undefined;
  logDate: string;
  onFoodLogged?: (log: FoodLog) => void;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

const mealOptions: MealType[] = ["Breakfast", "Lunch", "Dinner", "Snack"];

export function QuickAddFoodDialog({ userId, logDate, onFoodLogged, trigger, open: controlledOpen, onOpenChange }: QuickAddFoodDialogProps) {
  const { toast } = useToast();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (value: boolean) => {
    setInternalOpen(value);
    onOpenChange?.(value);
  };
  const [mealType, setMealType] = useState<MealType>("Breakfast");
  const [foodName, setFoodName] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setFoodName("");
      setCalories("");
      setProtein("");
      setCarbs("");
      setFat("");
      setMealType("Breakfast");
      setIsSubmitting(false);
    }
  }, [open]);

  async function handleSubmit() {
    if (!userId) {
      toast({ title: "Sign in required", description: "Please sign in before logging food." });
      return;
    }
    const kcal = Number(calories);
    if (!foodName.trim() || Number.isNaN(kcal) || kcal < 0) {
      toast({ title: "Check entry", description: "Enter a food name and a valid calorie value." });
      return;
    }
    setIsSubmitting(true);
    try {
      const log = await quickAddManualFoodLog({
        userId,
        date: logDate,
        mealType,
        calories: kcal,
        proteinG: Number(protein) || 0,
        carbsG: Number(carbs) || 0,
        fatG: Number(fat) || 0,
        notes: foodName.trim(),
      });
      toast({ title: "Food logged", description: `${foodName.trim()} added to ${displayMealType(mealType)}.` });
      onFoodLogged?.(log);
      setOpen(false);
    } catch (error) {
      toast({
        title: "Could not log food",
        description: userSafeError(error),
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button className="min-h-12 gap-2 rounded-xl text-base shadow-luxe" aria-label="Quick add food">
            <Zap className="h-5 w-5" />
            Quick add food
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Quick add food</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="qa-food-name">Food name</Label>
            <Input
              id="qa-food-name"
              value={foodName}
              onChange={(e) => setFoodName(e.target.value)}
              placeholder="e.g. Omelette, protein shake"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="qa-calories">Calories</Label>
              <Input id="qa-calories" type="number" min="0" inputMode="decimal" value={calories} onChange={(e) => setCalories(e.target.value)} placeholder="kcal" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="qa-meal">Meal type</Label>
              <Select
                id="qa-meal"
                value={mealType}
                onChange={(v) => setMealType(v as MealType)}
                options={mealOptions.map((m) => ({ value: m, label: displayMealType(m) }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="qa-protein">Protein</Label>
              <Input id="qa-protein" type="number" min="0" inputMode="decimal" value={protein} onChange={(e) => setProtein(e.target.value)} placeholder="g" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="qa-carbs">Carbs</Label>
              <Input id="qa-carbs" type="number" min="0" inputMode="decimal" value={carbs} onChange={(e) => setCarbs(e.target.value)} placeholder="g" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="qa-fat">Fat</Label>
              <Input id="qa-fat" type="number" min="0" inputMode="decimal" value={fat} onChange={(e) => setFat(e.target.value)} placeholder="g" />
            </div>
          </div>
          <Button className="w-full min-h-12" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Adding..." : "Add to log"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function displayMealType(type: MealType) {
  return type === "Snack" ? "Snacks" : type;
}
