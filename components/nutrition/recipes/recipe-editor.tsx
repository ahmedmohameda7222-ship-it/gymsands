"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, ChevronDown, Plus, RefreshCw, Sparkles, Trash2, Upload } from "lucide-react";

import { recipeApi } from "@/components/nutrition/recipes/recipe-api";
import { useAuth } from "@/components/auth/auth-provider";
import { supabase } from "@/lib/supabase/client";

type Ingredient = {
  food_id: string | null;
  ingredient_name: string;
  quantity: string;
  unit: string;
  frozen_nutrition: Record<string, unknown> | null;
};

type Instruction = {
  instruction: string;
  duration_seconds: string;
  heat_or_temperature: string;
  doneness_or_result_cue: string;
  prep_ahead_cue: string;
};

type Equipment = { name: string; quantity: string; note: string };

type Workspace = {
  root: { id: string; name: string; cover_path: string | null; is_favorite: boolean };
  draft: null | { id: string; name: string | null; servings: number | string | null; total_time_minutes: number | string | null; notes: string | null; draft_metadata: Record<string, unknown> };
  latestVersion: null | { id: string; version_number: number; name: string; servings: number; total_time_minutes: number | null; metadata: Record<string, unknown> };
  ingredients: Array<{ food_id: string | null; ingredient_name: string; quantity: number | string | null; unit: string | null; frozen_nutrition: Record<string, unknown> | null }>;
  instructions: Array<{ instruction: string; duration_seconds?: number | string | null; heat_or_temperature?: string | null; doneness_or_result_cue?: string | null; prep_ahead_cue?: string | null }>;
  equipment: Array<{ name: string; quantity: number | string | null; note: string | null }>;
  cuisine: string | null;
  nutritionPerServing: Record<string, number | null> | null;
};

type DraftPayload = {
  name: string | null;
  servings: number | null;
  total_time_minutes: number | null;
  notes: string | null;
  ingredients: Array<{ food_id: string | null; ingredient_name: string; quantity: number | null; unit: string | null; frozen_nutrition: Record<string, unknown> | null }>;
  instructions: Array<{ instruction: string; duration_seconds: number | null; heat_or_temperature: string | null; doneness_or_result_cue: string | null; prep_ahead_cue: string | null }>;
  equipment: Array<{ name: string; quantity: number | null; note: string | null }>;
  draft_metadata: Record<string, unknown>;
};

const numberOrNull = (value: string) => value.trim() && Number.isFinite(Number(value)) ? Number(value) : null;
const textOrNull = (value: string) => value.trim() || null;

function ingredientFromApi(item: Workspace["ingredients"][number]): Ingredient {
  return { food_id: item.food_id, ingredient_name: item.ingredient_name, quantity: item.quantity === null ? "" : String(item.quantity), unit: item.unit ?? "", frozen_nutrition: item.frozen_nutrition };
}

function instructionFromApi(item: Workspace["instructions"][number]): Instruction {
  return {
    instruction: item.instruction,
    duration_seconds: item.duration_seconds === null || item.duration_seconds === undefined ? "" : String(item.duration_seconds),
    heat_or_temperature: item.heat_or_temperature ?? "",
    doneness_or_result_cue: item.doneness_or_result_cue ?? "",
    prep_ahead_cue: item.prep_ahead_cue ?? "",
  };
}

function equipmentFromApi(item: Workspace["equipment"][number]): Equipment {
  return { name: item.name, quantity: item.quantity === null ? "" : String(item.quantity), note: item.note ?? "" };
}

export function RecipeEditor({
  recipeId,
  initialAssistantMode,
  linkedFood,
}: {
  recipeId: string;
  initialAssistantMode?: "create" | "import" | "finish" | null;
  linkedFood?: { id: string; name: string } | null;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [name, setName] = useState("");
  const [servings, setServings] = useState("");
  const [totalTime, setTotalTime] = useState("");
  const [notes, setNotes] = useState("");
  const [cuisine, setCuisine] = useState("");
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [instructions, setInstructions] = useState<Instruction[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [coverPath, setCoverPath] = useState<string | null>(null);
  const [coverPhotoUrl, setCoverPhotoUrl] = useState<string | null>(null);
  const [moreDetails, setMoreDetails] = useState(false);
  const [cookingDetails, setCookingDetails] = useState(false);
  const [assistantMode, setAssistantMode] = useState<"create" | "import" | "finish" | null>(initialAssistantMode ?? null);
  const [status, setStatus] = useState("Loading…");
  const [error, setError] = useState<string | null>(null);
  const [assistantStatus, setAssistantStatus] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const lastSavedPayload = useRef("");
  const saveTimer = useRef<number | null>(null);

  const draftMetadata = useMemo(() => {
    const base = workspace?.draft?.draft_metadata ?? workspace?.latestVersion?.metadata ?? {};
    return {
      ...base,
      ...(cuisine.trim() ? { cuisine: cuisine.trim() } : { cuisine: null }),
      ...(workspace?.nutritionPerServing ? { nutrition_per_serving: workspace.nutritionPerServing } : {}),
    };
  }, [workspace, cuisine]);

  const payload = useMemo<DraftPayload>(() => ({
    name: textOrNull(name),
    servings: numberOrNull(servings),
    total_time_minutes: numberOrNull(totalTime),
    notes: textOrNull(notes),
    ingredients: ingredients
      .filter((item) => item.ingredient_name.trim())
      .map((item) => ({ food_id: item.food_id, ingredient_name: item.ingredient_name.trim(), quantity: numberOrNull(item.quantity), unit: textOrNull(item.unit), frozen_nutrition: item.frozen_nutrition })),
    instructions: instructions
      .filter((item) => item.instruction.trim())
      .map((item) => ({ instruction: item.instruction.trim(), duration_seconds: numberOrNull(item.duration_seconds), heat_or_temperature: textOrNull(item.heat_or_temperature), doneness_or_result_cue: textOrNull(item.doneness_or_result_cue), prep_ahead_cue: textOrNull(item.prep_ahead_cue) })),
    equipment: equipment
      .filter((item) => item.name.trim())
      .map((item) => ({ name: item.name.trim(), quantity: numberOrNull(item.quantity), note: textOrNull(item.note) })),
    draft_metadata: draftMetadata,
  }), [name, servings, totalTime, notes, ingredients, instructions, equipment, draftMetadata]);

  const serializedPayload = useMemo(() => JSON.stringify(payload), [payload]);

  const applyWorkspace = useCallback(async (value: Workspace) => {
    setWorkspace(value);
    setName(value.draft?.name ?? value.latestVersion?.name ?? value.root.name ?? "");
    setServings(value.draft?.servings === null || value.draft?.servings === undefined ? "" : String(value.draft.servings));
    setTotalTime(value.draft?.total_time_minutes === null || value.draft?.total_time_minutes === undefined ? "" : String(value.draft.total_time_minutes));
    setNotes(value.draft?.notes ?? "");
    setCuisine(value.cuisine ?? "");
    setIngredients(value.ingredients.map(ingredientFromApi));
    setInstructions(value.instructions.map(instructionFromApi));
    setEquipment(value.equipment.map(equipmentFromApi));
    setCoverPath(value.root.cover_path ?? null);
    setCoverPhotoUrl(null);
    if (value.root.cover_path) {
      const signed = await supabase.storage.from("recipe-covers").createSignedUrl(value.root.cover_path, 3600);
      if (!signed.error) setCoverPhotoUrl(signed.data.signedUrl);
    }
    const initial: DraftPayload = {
      name: textOrNull(value.draft?.name ?? value.latestVersion?.name ?? value.root.name ?? ""),
      servings: value.draft?.servings === null || value.draft?.servings === undefined ? null : Number(value.draft.servings),
      total_time_minutes: value.draft?.total_time_minutes === null || value.draft?.total_time_minutes === undefined ? null : Number(value.draft.total_time_minutes),
      notes: textOrNull(value.draft?.notes ?? ""),
      ingredients: value.ingredients.map((item) => ({ food_id: item.food_id, ingredient_name: item.ingredient_name, quantity: item.quantity === null ? null : Number(item.quantity), unit: item.unit, frozen_nutrition: item.frozen_nutrition })),
      instructions: value.instructions.map((item) => ({ instruction: item.instruction, duration_seconds: item.duration_seconds === null || item.duration_seconds === undefined ? null : Number(item.duration_seconds), heat_or_temperature: item.heat_or_temperature ?? null, doneness_or_result_cue: item.doneness_or_result_cue ?? null, prep_ahead_cue: item.prep_ahead_cue ?? null })),
      equipment: value.equipment.map((item) => ({ name: item.name, quantity: item.quantity === null ? null : Number(item.quantity), note: item.note ?? null })),
      draft_metadata: {
        ...(value.draft?.draft_metadata ?? value.latestVersion?.metadata ?? {}),
        ...(value.cuisine ? { cuisine: value.cuisine } : { cuisine: null }),
        ...(value.nutritionPerServing ? { nutrition_per_serving: value.nutritionPerServing } : {}),
      },
    };
    lastSavedPayload.current = JSON.stringify(initial);
    setStatus("Saved");
    setReady(true);
  }, []);

  const load = useCallback(async () => {
    setReady(false);
    setStatus("Loading…");
    try {
      let result = await recipeApi<{ recipe: Workspace }>(`/${recipeId}`);
      if (!result.recipe.draft && result.recipe.latestVersion) result = await recipeApi<{ recipe: Workspace }>(`/${recipeId}/draft`, { method: "POST" });
      if (!result.recipe.draft) throw new Error("Recipe Working Draft is unavailable.");
      await applyWorkspace(result.recipe);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Recipe editor could not be loaded.");
      setStatus("Not saved yet · Retrying…");
    }
  }, [recipeId, applyWorkspace]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!ready || !linkedFood || ingredients.some((item) => item.food_id === linkedFood.id)) return;
    setIngredients((current) => [...current, { food_id: linkedFood.id, ingredient_name: linkedFood.name, quantity: "", unit: "", frozen_nutrition: null }]);
  }, [ready, linkedFood, ingredients]);

  const persist = useCallback(async (draft: DraftPayload, serialized = JSON.stringify(draft)) => {
    setStatus("Saving…");
    try {
      const result = await recipeApi<{ recipe: Workspace }>(`/${recipeId}`, { method: "PATCH", body: JSON.stringify({ operation: "autosave", draft }) });
      setWorkspace(result.recipe);
      lastSavedPayload.current = serialized;
      setStatus("Saved");
      setError(null);
      return result.recipe;
    } catch (cause) {
      setStatus("Not saved yet · Retrying…");
      setError(cause instanceof Error ? cause.message : "Draft could not be saved.");
      throw cause;
    }
  }, [recipeId]);

  useEffect(() => {
    if (!ready || serializedPayload === lastSavedPayload.current) return;
    setStatus("Saving…");
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => { void persist(payload, serializedPayload).catch(() => undefined); }, 650);
    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); };
  }, [ready, payload, serializedPayload, persist]);

  async function saveRecipe() {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    try {
      await persist(payload, serializedPayload);
      await recipeApi(`/${recipeId}/publish`, { method: "POST" });
      router.push(`/my-recipes/${recipeId}`);
      router.refresh();
    } catch {
      // Persist/publish already supplied the user-facing error state.
    }
  }

  async function discardDraft() {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    try {
      if (workspace?.latestVersion) {
        await recipeApi(`/${recipeId}/draft`, { method: "DELETE" });
        router.push(`/my-recipes/${recipeId}`);
      } else {
        await recipeApi(`/${recipeId}`, { method: "DELETE" });
        router.push("/my-recipes");
      }
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Draft could not be discarded.");
    }
  }

  function updateIngredient(index: number, patch: Partial<Ingredient>) {
    setIngredients((current) => current.map((item, position) => position === index ? { ...item, ...patch } : item));
  }

  function updateInstruction(index: number, patch: Partial<Instruction>) {
    setInstructions((current) => current.map((item, position) => position === index ? { ...item, ...patch } : item));
  }

  function updateEquipment(index: number, patch: Partial<Equipment>) {
    setEquipment((current) => current.map((item, position) => position === index ? { ...item, ...patch } : item));
  }

  async function uploadCover(file: File | undefined) {
    if (!file || !user) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 10 * 1024 * 1024) {
      setError("Recipe cover must be a JPEG, PNG, or WebP up to 10 MB.");
      return;
    }
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-80) || "cover";
    const path = `${user.id}/${recipeId}/${crypto.randomUUID()}-${safeName}`;
    const upload = await supabase.storage.from("recipe-covers").upload(path, file, { contentType: file.type, upsert: false });
    if (upload.error) { setError(upload.error.message); return; }
    try {
      await recipeApi(`/${recipeId}`, { method: "PATCH", body: JSON.stringify({ operation: "presentation", coverPath: path }) });
      const previous = coverPath;
      setCoverPath(path);
      const signed = await supabase.storage.from("recipe-covers").createSignedUrl(path, 3600);
      setCoverPhotoUrl(signed.error ? null : signed.data.signedUrl);
      if (previous && previous !== path) await supabase.storage.from("recipe-covers").remove([previous]);
      setError(null);
    } catch (cause) {
      await supabase.storage.from("recipe-covers").remove([path]);
      setError(cause instanceof Error ? cause.message : "Cover photo could not be saved.");
    }
  }

  async function removeCover() {
    const previous = coverPath;
    try {
      await recipeApi(`/${recipeId}`, { method: "PATCH", body: JSON.stringify({ operation: "presentation", coverPath: null }) });
      setCoverPath(null);
      setCoverPhotoUrl(null);
      if (previous) await supabase.storage.from("recipe-covers").remove([previous]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Cover photo could not be removed.");
    }
  }

  const chatPrompt = useMemo(() => {
    const mode = assistantMode ?? "finish";
    const facts = {
      name: name || null,
      servings: numberOrNull(servings),
      ingredients: ingredients.filter((item) => item.ingredient_name.trim()).map((item) => ({ name: item.ingredient_name, quantity: numberOrNull(item.quantity), unit: textOrNull(item.unit), food_id: item.food_id })),
      instructions: instructions.filter((item) => item.instruction.trim()).map((item) => item.instruction),
      total_time_minutes: numberOrNull(totalTime),
      cuisine: textOrNull(cuisine),
    };
    const task = mode === "create" ? "Create a Recipe Working Draft from my request." : mode === "import" ? "Import the Recipe I provide into a structured Working Draft." : "Finish the missing authoring facts in this Recipe Working Draft.";
    return `${task}\n\nCurrent Plaivra Draft facts:\n${JSON.stringify(facts, null, 2)}\n\nReturn authoring facts only. Do not treat ChatGPT nutrient estimates as Plaivra nutrition authority. Do not publish the Recipe. Use the authorized Plaivra Nutrition MCP Draft write only after I explicitly approve the proposal.`;
  }, [assistantMode, name, servings, ingredients, instructions, totalTime, cuisine]);

  async function openInChatGPT(mode: "create" | "import" | "finish") {
    setAssistantMode(mode);
    try { await navigator.clipboard.writeText(chatPrompt); } catch { /* Clipboard can be unavailable; prompt remains visible below. */ }
    window.open("https://chatgpt.com/", "_blank", "noopener,noreferrer");
    setAssistantStatus("Review the proposal in ChatGPT, then approve the MCP Draft change. Return here and refresh the Draft after approval.");
  }

  if (!ready && !workspace) return <div className="mx-auto max-w-[720px] space-y-3 px-4 py-6"><div className="h-10 animate-pulse rounded-xl bg-muted" /><div className="h-48 animate-pulse rounded-2xl bg-muted" /></div>;

  return (
    <div className="mx-auto w-full max-w-[720px] space-y-6 px-4 py-5 sm:px-6">
      <header className="flex flex-col gap-3 border-b border-border/70 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href={workspace?.latestVersion ? `/my-recipes/${recipeId}` : "/my-recipes"} className="text-sm text-muted-foreground hover:text-foreground">Back</Link>
          <h1 className="mt-1 text-2xl font-semibold">Recipe editor</h1>
          <p className="mt-1 text-xs text-muted-foreground" role="status">{status}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void discardDraft()} className="min-h-11 rounded-xl border border-border px-3 text-sm font-medium hover:bg-muted">{workspace?.latestVersion ? "Discard draft" : "Delete Draft"}</button>
          <button type="button" onClick={() => void saveRecipe()} className="min-h-11 rounded-xl bg-foreground px-4 text-sm font-semibold text-background">Save Recipe</button>
        </div>
      </header>

      {error ? <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}

      <section className="space-y-4" aria-labelledby="recipe-basics-heading">
        <h2 id="recipe-basics-heading" className="text-lg font-semibold">Basics</h2>
        <label className="block text-sm font-medium">Recipe name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={200} className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 font-normal" /></label>
        <label className="block text-sm font-medium">Servings<input inputMode="decimal" value={servings} onChange={(event) => setServings(event.target.value)} placeholder="e.g. 4" className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 font-normal" /></label>
      </section>

      <section className="space-y-3 border-t border-border/70 pt-5" aria-labelledby="ingredients-editor-heading">
        <div className="flex items-center justify-between gap-3"><div><h2 id="ingredients-editor-heading" className="text-lg font-semibold">Ingredients</h2><p className="text-sm text-muted-foreground">Link a Food when possible; manual ingredients keep nutrition unknown until resolved.</p></div><Link href={`/calories/food-hub?destination=recipe&recipeId=${recipeId}`} className="inline-flex min-h-11 items-center rounded-xl border border-border px-3 text-sm font-medium hover:bg-muted">Add ingredient</Link></div>
        <div className="space-y-2">
          {ingredients.map((item, index) => (
            <div key={`${index}-${item.food_id ?? "manual"}`} className="rounded-xl border border-border/70 p-3">
              <div className="grid gap-2 sm:grid-cols-[1fr_100px_90px_auto]">
                <label className="text-xs font-medium text-muted-foreground">Ingredient<input value={item.ingredient_name} onChange={(event) => updateIngredient(index, { ingredient_name: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground" /></label>
                <label className="text-xs font-medium text-muted-foreground">Quantity<input inputMode="decimal" value={item.quantity} onChange={(event) => updateIngredient(index, { quantity: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground" /></label>
                <label className="text-xs font-medium text-muted-foreground">Unit<input value={item.unit} onChange={(event) => updateIngredient(index, { unit: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground" /></label>
                <button type="button" onClick={() => setIngredients((current) => current.filter((_, position) => position !== index))} className="mt-5 inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-muted" aria-label={`Remove ${item.ingredient_name || "ingredient"}`}><Trash2 className="h-4 w-4" /></button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{item.food_id ? "Plaivra Food linked" : "Manual ingredient · nutrition remains unknown until linked"}</p>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setIngredients((current) => [...current, { food_id: null, ingredient_name: "", quantity: "", unit: "", frozen_nutrition: null }])} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm font-medium hover:bg-muted"><Plus className="h-4 w-4" />Add as ingredient</button>
      </section>

      <section className="space-y-3 border-t border-border/70 pt-5" aria-labelledby="instructions-editor-heading">
        <div className="flex items-center justify-between"><h2 id="instructions-editor-heading" className="text-lg font-semibold">Instructions</h2><button type="button" onClick={() => setInstructions((current) => [...current, { instruction: "", duration_seconds: "", heat_or_temperature: "", doneness_or_result_cue: "", prep_ahead_cue: "" }])} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm font-medium hover:bg-muted"><Plus className="h-4 w-4" />Add step</button></div>
        {instructions.map((step, index) => <div key={index} className="rounded-xl border border-border/70 p-3"><div className="flex gap-2"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">{index + 1}</span><textarea value={step.instruction} onChange={(event) => updateInstruction(index, { instruction: event.target.value })} rows={3} className="min-h-20 flex-1 resize-y rounded-lg border border-border bg-background p-2 text-sm" aria-label={`Instruction ${index + 1}`} /><button type="button" onClick={() => setInstructions((current) => current.filter((_, position) => position !== index))} className="h-10 w-10 rounded-lg hover:bg-muted" aria-label={`Remove instruction ${index + 1}`}><Trash2 className="mx-auto h-4 w-4" /></button></div>{cookingDetails ? <div className="mt-3 grid gap-2 sm:grid-cols-2"><label className="text-xs font-medium text-muted-foreground">Duration seconds<input inputMode="numeric" value={step.duration_seconds} onChange={(event) => updateInstruction(index, { duration_seconds: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground" /></label><label className="text-xs font-medium text-muted-foreground">Heat or temperature<input value={step.heat_or_temperature} onChange={(event) => updateInstruction(index, { heat_or_temperature: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground" /></label><label className="text-xs font-medium text-muted-foreground">Doneness/result cue<input value={step.doneness_or_result_cue} onChange={(event) => updateInstruction(index, { doneness_or_result_cue: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground" /></label><label className="text-xs font-medium text-muted-foreground">Prep-ahead cue<input value={step.prep_ahead_cue} onChange={(event) => updateInstruction(index, { prep_ahead_cue: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground" /></label></div> : null}</div>)}
        <button type="button" onClick={() => setCookingDetails((value) => !value)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm font-medium hover:bg-muted">Add cooking details<ChevronDown className={`h-4 w-4 transition ${cookingDetails ? "rotate-180" : ""}`} /></button>
      </section>

      <section className="border-t border-border/70 pt-5">
        <button type="button" onClick={() => setMoreDetails((value) => !value)} className="flex min-h-11 w-full items-center justify-between rounded-xl px-1 text-left text-lg font-semibold">More details<ChevronDown className={`h-5 w-5 transition ${moreDetails ? "rotate-180" : ""}`} /></button>
        {moreDetails ? <div className="mt-3 space-y-4"><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Total time<input inputMode="numeric" value={totalTime} onChange={(event) => setTotalTime(event.target.value)} placeholder="Minutes" className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 font-normal" /></label><label className="text-sm font-medium">Cuisine<input value={cuisine} onChange={(event) => setCuisine(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 font-normal" /></label></div><label className="block text-sm font-medium">Notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-border bg-background p-3 font-normal" /></label><div><p className="text-sm font-medium">Cover photo</p>{coverPhotoUrl ? <div className="mt-2 h-44 rounded-2xl bg-cover bg-center" style={{ backgroundImage: `url(${JSON.stringify(coverPhotoUrl).slice(1, -1)})` }} role="img" aria-label="Recipe cover preview" /> : <div className="mt-2 flex h-32 items-center justify-center rounded-2xl bg-muted text-sm text-muted-foreground">No cover photo</div>}<div className="mt-2 flex flex-wrap gap-2"><label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-border px-3 text-sm font-medium hover:bg-muted"><Upload className="h-4 w-4" />{coverPath ? "Replace photo" : "Choose from Library"}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => void uploadCover(event.target.files?.[0])} /></label><label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-border px-3 text-sm font-medium hover:bg-muted"><Camera className="h-4 w-4" />Take Photo<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={(event) => void uploadCover(event.target.files?.[0])} /></label>{coverPath ? <button type="button" onClick={() => void removeCover()} className="min-h-11 rounded-xl px-3 text-sm font-medium text-destructive hover:bg-destructive/10">Remove photo</button> : null}</div></div><div><div className="flex items-center justify-between"><p className="text-sm font-medium">Equipment</p><button type="button" onClick={() => setEquipment((current) => [...current, { name: "", quantity: "", note: "" }])} className="min-h-11 rounded-xl px-3 text-sm font-medium hover:bg-muted">Add equipment</button></div>{equipment.map((item, index) => <div key={index} className="mt-2 grid gap-2 rounded-xl border border-border/70 p-3 sm:grid-cols-[1fr_90px_auto]"><input value={item.name} onChange={(event) => updateEquipment(index, { name: event.target.value })} placeholder="Equipment" className="h-10 rounded-lg border border-border bg-background px-2 text-sm" /><input value={item.quantity} onChange={(event) => updateEquipment(index, { quantity: event.target.value })} placeholder="Qty" className="h-10 rounded-lg border border-border bg-background px-2 text-sm" /><button type="button" onClick={() => setEquipment((current) => current.filter((_, position) => position !== index))} className="h-10 w-10 rounded-lg hover:bg-muted" aria-label={`Remove ${item.name || "equipment"}`}><Trash2 className="mx-auto h-4 w-4" /></button><input value={item.note} onChange={(event) => updateEquipment(index, { note: event.target.value })} placeholder="Optional note" className="h-10 rounded-lg border border-border bg-background px-2 text-sm sm:col-span-3" /></div>)}</div></div> : null}
      </section>

      <section className="space-y-3 border-t border-border/70 pt-5" aria-labelledby="chatgpt-recipe-heading">
        <div><h2 id="chatgpt-recipe-heading" className="text-lg font-semibold">ChatGPT</h2><p className="mt-1 text-sm text-muted-foreground">External reasoning only. Review the proposal, then explicitly approve the Working Draft change. Plaivra remains the nutrition authority.</p></div>
        <div className="flex flex-wrap gap-2"><button type="button" onClick={() => void openInChatGPT("create")} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm font-medium hover:bg-muted"><Sparkles className="h-4 w-4" />Create with ChatGPT</button><button type="button" onClick={() => void openInChatGPT("import")} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm font-medium hover:bg-muted"><Sparkles className="h-4 w-4" />Import with ChatGPT</button><button type="button" onClick={() => void openInChatGPT("finish")} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm font-medium hover:bg-muted"><Sparkles className="h-4 w-4" />Finish with ChatGPT</button></div>
        {assistantMode ? <div className="rounded-xl border border-border/70 bg-muted/30 p-3"><p className="text-sm font-medium">Proposal handoff</p><p className="mt-1 text-sm text-muted-foreground">The prompt is copied before ChatGPT opens. Review and approve the proposal there; the authorized MCP may update only this Working Draft.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => void openInChatGPT(assistantMode)} className="min-h-11 rounded-xl bg-foreground px-3 text-sm font-medium text-background">Open in ChatGPT</button><button type="button" onClick={() => void load()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm font-medium hover:bg-muted"><RefreshCw className="h-4 w-4" />Refresh Draft</button></div><details className="mt-2"><summary className="cursor-pointer text-xs font-medium text-muted-foreground">View outbound prompt</summary><pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap rounded-lg bg-background p-2 text-xs">{chatPrompt}</pre></details></div> : null}
        {assistantStatus ? <p className="text-xs text-muted-foreground" role="status">{assistantStatus}</p> : null}
      </section>
    </div>
  );
}
