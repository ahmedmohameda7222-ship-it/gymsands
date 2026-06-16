"use client";

import { FormEvent, useEffect, useState } from "react";
import { RefreshCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toaster";
import { adminUpsertGlobalFood } from "@/services/database/admin";
import { getGlobalFoods } from "@/services/database/nutrition";
import type { FoodItem } from "@/types";

const emptyForm = {
  id: "",
  food_name: "",
  serving_size: "",
  calories: "",
  protein_g: "",
  carbs_g: "",
  fat_g: "",
  category: ""
};

function parseNonNegativeNumber(value: string, label: string) {
  if (!value.trim()) throw new Error(`${label} is required.`);
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new Error(`${label} must be a valid number.`);
  if (numeric < 0) throw new Error(`${label} cannot be negative.`);
  return numeric;
}

function validateForm(form: typeof emptyForm) {
  const foodName = form.food_name.trim();
  const servingSize = form.serving_size.trim();
  const category = form.category.trim();

  if (!foodName) throw new Error("Food name is required.");
  if (!servingSize) throw new Error("Serving size is required.");
  if (!category) throw new Error("Category is required.");

  return {
    food_name: foodName,
    serving_size: servingSize,
    category,
    calories: parseNonNegativeNumber(form.calories, "Calories"),
    protein_g: parseNonNegativeNumber(form.protein_g, "Protein"),
    carbs_g: parseNonNegativeNumber(form.carbs_g, "Carbs"),
    fat_g: parseNonNegativeNumber(form.fat_g, "Fat")
  };
}

export function AdminFoodPanelSafe() {
  const { toast } = useToast();
  const [foods, setFoods] = useState<FoodItem[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function loadFoods() {
    setIsLoading(true);
    setLoadError(null);
    try {
      const items = await getGlobalFoods(search);
      setFoods(items.slice(0, 50));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load global foods.";
      setLoadError(message);
      toast({ title: "Could not load foods", description: message });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => { void loadFoods(); }, 300);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    let validated: ReturnType<typeof validateForm>;
    try {
      validated = validateForm(form);
    } catch (error) {
      toast({ title: "Check food details", description: error instanceof Error ? error.message : "Please review the food details." });
      return;
    }

    setIsSaving(true);
    try {
      await adminUpsertGlobalFood({
        ...(form.id ? { id: form.id } : {}),
        ...validated,
        source_type: "admin_created",
        cuisine: "Egyptian"
      });
      await loadFoods();
      setForm(emptyForm);
      toast({ title: "Global food saved", description: "The preview list has been refreshed." });
    } catch (error) {
      toast({ title: "Could not save food", description: error instanceof Error ? error.message : "Please review the food details and try again." });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Add or edit Egyptian food</CardTitle>
          <CardDescription>Admin food macros are validated before saving. Negative, empty, or invalid values are rejected.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit}>
            <TextField label="Food name" value={form.food_name} onChange={(food_name) => setForm((current) => ({ ...current, food_name }))} placeholder="Food name, e.g. Molokhia" />
            <TextField label="Serving size" value={form.serving_size} onChange={(serving_size) => setForm((current) => ({ ...current, serving_size }))} placeholder="Serving size, e.g. 1 bowl" />
            <TextField label="Calories" type="number" inputMode="decimal" enterKeyHint="done" value={form.calories} onChange={(calories) => setForm((current) => ({ ...current, calories }))} placeholder="Calories, e.g. 180" />
            <TextField label="Protein g" type="number" inputMode="decimal" enterKeyHint="done" value={form.protein_g} onChange={(protein_g) => setForm((current) => ({ ...current, protein_g }))} placeholder="Protein grams, e.g. 5" />
            <TextField label="Carbs g" type="number" inputMode="decimal" enterKeyHint="done" value={form.carbs_g} onChange={(carbs_g) => setForm((current) => ({ ...current, carbs_g }))} placeholder="Carbs grams, e.g. 12" />
            <TextField label="Fat g" type="number" inputMode="decimal" enterKeyHint="done" value={form.fat_g} onChange={(fat_g) => setForm((current) => ({ ...current, fat_g }))} placeholder="Fat grams, e.g. 12" />
            <div className="sm:col-span-2">
              <TextField label="Category" value={form.category} onChange={(category) => setForm((current) => ({ ...current, category }))} placeholder="Category, e.g. Stew" />
            </div>
            <div className="sm:col-span-2 flex gap-2">
              <Button type="submit" className="flex-1" disabled={isSaving}>
                <Save className="h-4 w-4" />
                {isSaving ? "Saving..." : form.id ? "Update global food" : "Save global food"}
              </Button>
              {form.id ? (
                <Button type="button" variant="outline" onClick={() => setForm(emptyForm)} disabled={isSaving}>
                  Cancel
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Current global foods</CardTitle>
            <div className="flex w-full gap-2 sm:w-auto">
              <TextField label="Search" value={search} onChange={setSearch} placeholder="Search Egyptian foods..." />
              <Button type="button" variant="outline" onClick={loadFoods} disabled={isLoading}>
                <RefreshCcw className="h-4 w-4" /> Refresh
              </Button>
            </div>
          </div>
          <CardDescription>Preview of admin-managed Egyptian foods. Showing up to 50 items.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? <p className="text-sm text-muted-foreground">Loading foods...</p> : null}
          {loadError ? (
            <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
              <p className="font-semibold">Could not load foods</p>
              <p className="mt-1">{loadError}</p>
              <Button type="button" variant="outline" size="sm" className="mt-3" onClick={loadFoods}>Retry</Button>
            </div>
          ) : null}
          {!isLoading && !loadError && !foods.length ? <p className="text-sm text-muted-foreground">No global foods found.</p> : null}
          {!loadError && foods.map((food) => (
            <div key={food.id} className="flex items-start justify-between gap-3 rounded-md border p-3">
              <div>
                <p className="font-semibold">{food.food_name}</p>
                <p className="text-sm text-muted-foreground">{food.calories} kcal | {food.protein_g}g protein | {food.carbs_g}g carbs | {food.fat_g}g fat</p>
                <p className="mt-1 text-xs text-muted-foreground">{food.serving_size} | {food.category || "Uncategorized"}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setForm({
                  id: food.id,
                  food_name: food.food_name ?? "",
                  serving_size: food.serving_size ?? "",
                  calories: food.calories?.toString() ?? "",
                  protein_g: food.protein_g?.toString() ?? "",
                  carbs_g: food.carbs_g?.toString() ?? "",
                  fat_g: food.fat_g?.toString() ?? "",
                  category: food.category ?? ""
                })}
              >
                Edit
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function TextField({ label, value, onChange, placeholder, type = "text", inputMode, enterKeyHint }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string; inputMode?: React.InputHTMLAttributes<HTMLInputElement>['inputMode']; enterKeyHint?: React.InputHTMLAttributes<HTMLInputElement>['enterKeyHint'] }) {
  return (
    <label className="grid gap-1 text-sm font-medium">
      {label}
      <Input type={type} inputMode={inputMode} enterKeyHint={enterKeyHint} min={type === "number" ? "0" : undefined} step={type === "number" ? "0.1" : undefined} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}
