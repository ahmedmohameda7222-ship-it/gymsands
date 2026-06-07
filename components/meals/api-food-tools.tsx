"use client";

import { useState } from "react";
import { Barcode, Beef, Bike, Search, Sparkles } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toaster";

function macroLine(food: any) {
  return `${food.calories ?? "?"} kcal | P ${food.protein ?? "?"}g | C ${food.carbs ?? "?"}g | F ${food.fat ?? "?"}g`;
}

export function ApiFoodTools() {
  const { session } = useAuth();
  const { toast } = useToast();
  const [barcode, setBarcode] = useState("");
  const [barcodeFood, setBarcodeFood] = useState<any>(null);
  const [usdaQuery, setUsdaQuery] = useState("");
  const [usdaFoods, setUsdaFoods] = useState<any[]>([]);
  const [mealText, setMealText] = useState("");
  const [mealResult, setMealResult] = useState<any>(null);
  const [exerciseText, setExerciseText] = useState("");
  const [exerciseResult, setExerciseResult] = useState<any>(null);

  function headers() {
    return { Authorization: `Bearer ${session?.access_token ?? ""}`, "Content-Type": "application/json" };
  }

  async function lookupBarcode() {
    const response = await fetch(`/api/food/open-food-facts?barcode=${encodeURIComponent(barcode)}`, { headers: { Authorization: `Bearer ${session?.access_token ?? ""}` } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return toast({ title: "Barcode lookup failed", description: data.error ?? "Try another barcode." });
    setBarcodeFood(data.food);
  }

  async function saveBarcodeFood() {
    const response = await fetch("/api/food/open-food-facts", { method: "POST", headers: headers(), body: JSON.stringify({ barcode }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return toast({ title: "Could not save food", description: data.error ?? "Please try again." });
    toast({ title: "Imported food saved", description: data.food?.name ?? barcodeFood?.name });
  }

  async function searchUsda() {
    const response = await fetch(`/api/food/usda/search?q=${encodeURIComponent(usdaQuery)}`, { headers: { Authorization: `Bearer ${session?.access_token ?? ""}` } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return toast({ title: "USDA unavailable", description: data.error ?? "Check configuration." });
    setUsdaFoods(data.foods ?? []);
  }

  async function saveUsda(fdcId: string) {
    const response = await fetch("/api/food/usda/detail", { method: "POST", headers: headers(), body: JSON.stringify({ fdcId }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return toast({ title: "Could not save USDA food", description: data.error ?? "Please try again." });
    toast({ title: "USDA food saved", description: data.food?.name ?? "Imported food" });
  }

  async function parseMeal() {
    const response = await fetch("/api/food/edamam/parse", { method: "POST", headers: headers(), body: JSON.stringify({ text: mealText }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return toast({ title: "Meal parser unavailable", description: data.error ?? "Check Edamam settings." });
    setMealResult(data.analysis);
  }

  async function parseExercise() {
    const response = await fetch("/api/food/nutritionix/parse-exercise", { method: "POST", headers: headers(), body: JSON.stringify({ query: exerciseText, save: true }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return toast({ title: "Exercise parser unavailable", description: data.error ?? "Check Nutritionix settings." });
    setExerciseResult(data.result);
    toast({ title: "Cardio estimate saved", description: "Review imported cardio activities in your progress data." });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Food and cardio imports</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-md border p-3">
          <p className="mb-2 flex items-center gap-2 font-semibold"><Barcode className="h-4 w-4 text-primary" /> Barcode lookup</p>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <Input value={barcode} onChange={(event) => setBarcode(event.target.value)} placeholder="Barcode" />
            <Button onClick={lookupBarcode}>Lookup</Button>
          </div>
          {barcodeFood ? (
            <div className="mt-3 rounded-md border bg-card p-3 text-sm">
              <p className="font-semibold">{barcodeFood.name}</p>
              <p className="text-muted-foreground">{barcodeFood.brand ?? "Unknown brand"} | {macroLine(barcodeFood)}</p>
              <Button className="mt-3" size="sm" onClick={saveBarcodeFood}>Save imported food</Button>
            </div>
          ) : null}
        </div>
        <div className="rounded-md border p-3">
          <p className="mb-2 flex items-center gap-2 font-semibold"><Search className="h-4 w-4 text-primary" /> USDA search</p>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <Input value={usdaQuery} onChange={(event) => setUsdaQuery(event.target.value)} placeholder="Rice, eggs, chicken..." />
            <Button onClick={searchUsda}>Search</Button>
          </div>
          <div className="mt-3 space-y-2">
            {usdaFoods.slice(0, 4).map((food) => (
              <div key={food.source_id} className="rounded-md border bg-card p-2 text-sm">
                <p className="font-semibold">{food.name}</p>
                <p className="text-muted-foreground">{macroLine(food)}</p>
                <Button className="mt-2" size="sm" variant="outline" onClick={() => saveUsda(food.source_id)}>Save</Button>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-md border p-3">
          <p className="mb-2 flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4 text-primary" /> Quick meal parser</p>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <Input value={mealText} onChange={(event) => setMealText(event.target.value)} placeholder="2 eggs and 100g rice" />
            <Button onClick={parseMeal}>Parse</Button>
          </div>
          {mealResult ? <p className="mt-3 rounded-md border bg-card p-3 text-sm text-muted-foreground">{Math.round(mealResult.calories ?? 0)} kcal estimated. Confirm before logging as a meal.</p> : null}
        </div>
        <div className="rounded-md border p-3">
          <p className="mb-2 flex items-center gap-2 font-semibold"><Bike className="h-4 w-4 text-primary" /> Exercise calories</p>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <Input value={exerciseText} onChange={(event) => setExerciseText(event.target.value)} placeholder="30 minutes running" />
            <Button onClick={parseExercise}><Beef className="h-4 w-4" /> Estimate</Button>
          </div>
          {exerciseResult?.exercises?.length ? <p className="mt-3 rounded-md border bg-card p-3 text-sm text-muted-foreground">{Math.round(exerciseResult.exercises[0].nf_calories ?? 0)} kcal estimated and saved as cardio.</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}
