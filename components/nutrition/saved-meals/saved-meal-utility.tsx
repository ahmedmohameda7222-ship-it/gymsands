"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Plus, Search, Trash2, X } from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import { RecentlyDeletedSavedMeals } from "@/components/nutrition/saved-meals/recently-deleted-saved-meals";
import { SavedMealEditor, type SavedMealEditorItem } from "@/components/nutrition/saved-meals/saved-meal-editor";
import { SavedMealPicker } from "@/components/nutrition/saved-meals/saved-meal-picker";
import { Button } from "@/components/ui/button";
import { useNutritionV1Translation } from "@/lib/i18n/nutrition-v1";
import type { FoodLibraryCandidate, FoodLibraryPage } from "@/services/nutrition-v1/server/food-library";
import type { RecipeHomeRecord } from "@/services/nutrition-v1/server/recipe-workspace";
import type { SavedMealItemInput } from "@/services/nutrition-v1/server/saved-meals";

type SavedMealListRow = {
  id: string;
  name: string;
  note: string | null;
  is_favorite: boolean;
  deleted_at: string | null;
  purge_after: string | null;
};

type SavedMealBundle = {
  saved_meal_id: string;
  frozen_name: string;
  items: SavedMealItemInput[];
};

type SavedMealDetail = {
  savedMeal: SavedMealListRow;
  bundle: SavedMealBundle | null;
};

type UtilityEditorItem = SavedMealEditorItem & { payload: SavedMealItemInput };
type Mode = "browse" | "detail" | "create" | "edit" | "deleted" | "add-food" | "add-recipe";

type PendingSavedMealCreateOperation = {
  fingerprint: string;
  operationId: string;
};

function savedMealCreateOperationStorageKey(ownerId: string) {
  return `plaivra:nutrition-v1:saved-meal:create:pending:${ownerId}`;
}

const copy = {
  en: {
    manage: "Manage Saved Meals", close: "Close Saved Meals", newMeal: "New Saved Meal", deleted: "Recently Deleted",
    back: "Back", detail: "Saved Meal detail", edit: "Edit", remove: "Delete", deleting: "Deleting…",
    loading: "Loading Saved Meals…", loadFailed: "Saved Meals could not be loaded.", detailFailed: "Saved Meal detail could not be loaded.",
    saveFailed: "Saved Meal could not be saved.", deleteFailed: "Saved Meal could not be deleted.", lifecycleFailed: "Saved Meal recovery action failed.",
    chooseFood: "Choose Food", chooseRecipe: "Choose Recipe", search: "Search", searchFood: "Search Foods", searchRecipe: "Search published Recipes",
    noMatches: "No matching items.", items: "Items", note: "Note", noNote: "No note.", recoverable: "Recoverable for 30 days after deletion.",
  },
  de: {
    manage: "Gespeicherte Mahlzeiten verwalten", close: "Gespeicherte Mahlzeiten schließen", newMeal: "Neue gespeicherte Mahlzeit", deleted: "Kürzlich gelöscht",
    back: "Zurück", detail: "Details der gespeicherten Mahlzeit", edit: "Bearbeiten", remove: "Löschen", deleting: "Wird gelöscht…",
    loading: "Gespeicherte Mahlzeiten werden geladen…", loadFailed: "Gespeicherte Mahlzeiten konnten nicht geladen werden.", detailFailed: "Details konnten nicht geladen werden.",
    saveFailed: "Die gespeicherte Mahlzeit konnte nicht gespeichert werden.", deleteFailed: "Die gespeicherte Mahlzeit konnte nicht gelöscht werden.", lifecycleFailed: "Die Wiederherstellungsaktion ist fehlgeschlagen.",
    chooseFood: "Lebensmittel auswählen", chooseRecipe: "Rezept auswählen", search: "Suchen", searchFood: "Lebensmittel suchen", searchRecipe: "Veröffentlichte Rezepte suchen",
    noMatches: "Keine passenden Einträge.", items: "Einträge", note: "Notiz", noNote: "Keine Notiz.", recoverable: "Nach dem Löschen 30 Tage wiederherstellbar.",
  },
  ar: {
    manage: "إدارة الوجبات المحفوظة", close: "إغلاق الوجبات المحفوظة", newMeal: "وجبة محفوظة جديدة", deleted: "المحذوفة مؤخرًا",
    back: "رجوع", detail: "تفاصيل الوجبة المحفوظة", edit: "تعديل", remove: "حذف", deleting: "جارٍ الحذف…",
    loading: "جارٍ تحميل الوجبات المحفوظة…", loadFailed: "تعذر تحميل الوجبات المحفوظة.", detailFailed: "تعذر تحميل تفاصيل الوجبة المحفوظة.",
    saveFailed: "تعذر حفظ الوجبة المحفوظة.", deleteFailed: "تعذر حذف الوجبة المحفوظة.", lifecycleFailed: "تعذر تنفيذ إجراء الاستعادة.",
    chooseFood: "اختيار طعام", chooseRecipe: "اختيار وصفة", search: "بحث", searchFood: "البحث في الأطعمة", searchRecipe: "البحث في الوصفات المنشورة",
    noMatches: "لا توجد نتائج مطابقة.", items: "العناصر", note: "ملاحظة", noNote: "لا توجد ملاحظة.", recoverable: "يمكن استعادتها لمدة 30 يومًا بعد الحذف.",
  },
} as const;

function authHeaders(token?: string | null, json = false) {
  return { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(json ? { "Content-Type": "application/json" } : {}) };
}

function savedMealCreateFingerprint(name: string, note: string, items: SavedMealItemInput[]) {
  return JSON.stringify({ name: name.trim(), note: note.trim() || null, items });
}

function readSavedMealCreateOperation(ownerId: string): PendingSavedMealCreateOperation | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(savedMealCreateOperationStorageKey(ownerId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingSavedMealCreateOperation>;
    if (typeof parsed.fingerprint !== "string" || typeof parsed.operationId !== "string") return null;
    return { fingerprint: parsed.fingerprint, operationId: parsed.operationId };
  } catch {
    return null;
  }
}

function pendingSavedMealCreateOperation(ownerId: string, fingerprint: string): PendingSavedMealCreateOperation {
  const stored = readSavedMealCreateOperation(ownerId);
  if (stored?.fingerprint === fingerprint) return stored;
  const pending = { fingerprint, operationId: crypto.randomUUID() };
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(savedMealCreateOperationStorageKey(ownerId), JSON.stringify(pending));
    } catch {
      // The current save attempt still retains the operation identity in memory.
    }
  }
  return pending;
}

function clearSavedMealCreateOperation(ownerId: string, operationId: string) {
  if (typeof window === "undefined") return;
  try {
    const stored = readSavedMealCreateOperation(ownerId);
    if (!stored || stored.operationId === operationId) window.sessionStorage.removeItem(savedMealCreateOperationStorageKey(ownerId));
  } catch {
    // Confirmed server success is authoritative even if storage cleanup fails.
  }
}

function editorItems(bundle: SavedMealBundle | null): UtilityEditorItem[] {
  if (!bundle) return [];
  return bundle.items.map((payload, index) => {
    if (payload.kind === "food") {
      return {
        id: `food:${payload.food_id}:${index}`,
        kind: "food",
        name: payload.frozen_name,
        servingLabel: `${payload.resolved_quantity} × ${payload.resolved_serving_label}`,
        payload,
      };
    }
    return {
      id: `recipe:${payload.recipe.recipe_id}:${payload.recipe.recipe_version_id}:${index}`,
      kind: "recipe",
      name: payload.recipe.frozen_recipe_name,
      servingLabel: `${payload.recipe.resolved_serving_quantity} × ${payload.recipe.resolved_serving_label}`,
      payload,
    };
  });
}

function foodPayload(food: FoodLibraryCandidate): SavedMealItemInput {
  return {
    kind: "food",
    food_id: food.id,
    frozen_name: food.name,
    resolved_quantity: 1,
    resolved_serving_label: food.servingLabel,
    frozen_nutrition: {
      calories: null,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
      fiber_g: null,
    },
  };
}

function recipePayload(recipe: RecipeHomeRecord): SavedMealItemInput | null {
  if (recipe.status !== "published" || !recipe.recipeVersionId) return null;
  return {
    kind: "recipe",
    recipe: {
      recipe_id: recipe.recipeId,
      recipe_version_id: recipe.recipeVersionId,
      resolved_serving_quantity: 1,
      resolved_serving_label: "1 serving",
      frozen_recipe_name: recipe.name,
      frozen_nutrition: {
        calories: null,
        protein_g: null,
        carbs_g: null,
        fat_g: null,
        fiber_g: null,
      },
    },
  };
}

export function SavedMealUtility({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { session, user } = useAuth();
  const token = session?.access_token;
  const ownerId = user?.id ?? session?.user.id ?? null;
  const { language, dir } = useNutritionV1Translation();
  const text = copy[language];
  const [mode, setMode] = useState<Mode>("browse");
  const [active, setActive] = useState<SavedMealListRow[]>([]);
  const [deleted, setDeleted] = useState<SavedMealListRow[]>([]);
  const [detail, setDetail] = useState<SavedMealDetail | null>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [items, setItems] = useState<UtilityEditorItem[]>([]);
  const [query, setQuery] = useState("");
  const [foods, setFoods] = useState<FoodLibraryCandidate[]>([]);
  const [recipes, setRecipes] = useState<RecipeHomeRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const request = useCallback(async <T,>(url: string, init: RequestInit = {}) => {
    const response = await fetch(url, {
      ...init,
      headers: { ...authHeaders(token, Boolean(init.body)), ...(init.headers ?? {}) },
      cache: "no-store",
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : text.loadFailed);
    return body as T;
  }, [text.loadFailed, token]);

  const loadActive = useCallback(async () => {
    setLoading(true);
    try {
      const body = await request<{ savedMeals: SavedMealListRow[] }>("/api/nutrition/v1/saved-meals");
      setActive(body.savedMeals);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : text.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [request, text.loadFailed]);

  const loadDeleted = useCallback(async () => {
    setLoading(true);
    try {
      const body = await request<{ savedMeals: SavedMealListRow[] }>("/api/nutrition/v1/saved-meals?deleted=true");
      setDeleted(body.savedMeals);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : text.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [request, text.loadFailed]);

  useEffect(() => {
    if (!open) return;
    setMode("browse");
    setDetail(null);
    setError("");
    void loadActive();
  }, [loadActive, open]);

  async function openDetail(id: string) {
    setLoading(true);
    try {
      const body = await request<SavedMealDetail>(`/api/nutrition/v1/saved-meals/${encodeURIComponent(id)}`);
      setDetail(body);
      setMode("detail");
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : text.detailFailed);
    } finally {
      setLoading(false);
    }
  }

  function beginCreate() {
    setDetail(null);
    setName("");
    setNote("");
    setItems([]);
    setMode("create");
    setError("");
  }

  function beginEdit() {
    if (!detail?.bundle) return;
    setName(detail.savedMeal.name);
    setNote(detail.savedMeal.note ?? "");
    setItems(editorItems(detail.bundle));
    setMode("edit");
    setError("");
  }

  async function save() {
    if (busy || !name.trim() || !items.length) return;
    setBusy(true);
    try {
      const editingId = mode === "edit" ? detail?.savedMeal.id : null;
      const itemPayloads = items.map((item) => item.payload);
      let createOperation: PendingSavedMealCreateOperation | null = null;
      if (!editingId) {
        if (!ownerId) throw new Error("Please sign in before creating a Saved Meal.");
        createOperation = pendingSavedMealCreateOperation(ownerId, savedMealCreateFingerprint(name, note, itemPayloads));
      }
      const requestBody = editingId
        ? { name, note, items: itemPayloads }
        : { operationId: createOperation!.operationId, name, note, items: itemPayloads };
      const body = await request<{ savedMeal: SavedMealListRow }>(editingId ? `/api/nutrition/v1/saved-meals/${encodeURIComponent(editingId)}` : "/api/nutrition/v1/saved-meals", {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify(requestBody),
      });
      if (createOperation) {
        if (!ownerId) throw new Error("Please sign in before completing Saved Meal creation.");
        clearSavedMealCreateOperation(ownerId, createOperation.operationId);
        setMode("browse");
      }
      await loadActive();
      await openDetail(body.savedMeal.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : text.saveFailed);
    } finally {
      setBusy(false);
    }
  }

  async function removeCurrent() {
    if (!detail || busy) return;
    setBusy(true);
    try {
      await request(`/api/nutrition/v1/saved-meals/${encodeURIComponent(detail.savedMeal.id)}`, { method: "DELETE" });
      setDetail(null);
      setMode("browse");
      await loadActive();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : text.deleteFailed);
    } finally {
      setBusy(false);
    }
  }

  async function lifecycle(id: string, operation: "restore" | "purge") {
    if (busyId) return;
    setBusyId(id);
    try {
      await request(`/api/nutrition/v1/saved-meals/${encodeURIComponent(id)}/commands`, {
        method: "POST",
        body: JSON.stringify({ operation }),
      });
      await Promise.all([loadActive(), loadDeleted()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : text.lifecycleFailed);
    } finally {
      setBusyId(null);
    }
  }

  async function searchCandidates(kind: "food" | "recipe") {
    setLoading(true);
    try {
      if (kind === "food") {
        const params = new URLSearchParams({ q: query, limit: "12", locale: language });
        const body = await request<FoodLibraryPage>(`/api/nutrition/v1/foods?${params.toString()}`);
        setFoods(body.items);
      } else {
        const body = await request<{ recipes: RecipeHomeRecord[] }>(`/api/nutrition/v1/recipes?q=${encodeURIComponent(query)}&limit=12`);
        setRecipes(body.recipes.filter((recipe) => recipe.status === "published" && recipe.recipeVersionId));
      }
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : text.loadFailed);
    } finally {
      setLoading(false);
    }
  }

  function addFood(food: FoodLibraryCandidate) {
    setItems((current) => [...current, {
      id: crypto.randomUUID(), kind: "food", name: food.name, servingLabel: `1 × ${food.servingLabel}`, payload: foodPayload(food),
    }]);
    setMode(detail ? "edit" : "create");
    setQuery("");
    setFoods([]);
  }

  function addRecipe(recipe: RecipeHomeRecord) {
    const payload = recipePayload(recipe);
    if (!payload) return;
    setItems((current) => [...current, {
      id: crypto.randomUUID(), kind: "recipe", name: recipe.name, servingLabel: "1 × 1 serving", payload,
    }]);
    setMode(detail ? "edit" : "create");
    setQuery("");
    setRecipes([]);
  }

  const pickerMeals = useMemo(() => active.map((meal) => ({
    id: meal.id,
    name: meal.name,
    itemCount: 0,
    summary: meal.note,
  })), [active]);

  const deletedRows = useMemo(() => deleted.map((meal) => {
    const locale = language === "de" ? "de-DE" : language === "ar" ? "ar" : "en-US";
    const format = (value: string | null) => value ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
    return { id: meal.id, name: meal.name, deletedAtLabel: format(meal.deleted_at), purgeAfterLabel: `${text.recoverable} · ${format(meal.purge_after)}` };
  }), [deleted, language, text.recoverable]);

  if (!open) return null;
  const editorMode = mode === "create" || mode === "edit";
  const selectionMode = mode === "add-food" || mode === "add-recipe";

  return (
    <div dir={dir} className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-label={text.manage}>
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-background p-4 shadow-xl sm:rounded-3xl sm:p-6">
        <header className="flex min-h-11 items-center justify-between gap-3 border-b border-border pb-3">
          <div className="flex min-w-0 items-center gap-2">
            {mode !== "browse" ? <button type="button" onClick={() => { setMode("browse"); setDetail(null); setError(""); }} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl hover:bg-muted" aria-label={text.back}><ArrowLeft className="h-4 w-4 rtl:rotate-180" /></button> : null}
            <h2 className="truncate text-lg font-semibold">{text.manage}</h2>
          </div>
          <button type="button" onClick={onClose} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl hover:bg-muted" aria-label={text.close}><X className="h-5 w-5" /></button>
        </header>

        {error ? <p role="alert" className="mt-3 rounded-xl border border-destructive/30 p-3 text-sm text-destructive">{error}</p> : null}
        {loading ? <p className="mt-4 text-sm text-muted-foreground" aria-live="polite">{text.loading}</p> : null}

        {mode === "browse" ? <div className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2"><Button type="button" onClick={beginCreate}><Plus className="me-1 h-4 w-4" />{text.newMeal}</Button><Button type="button" variant="outline" onClick={() => { setMode("deleted"); void loadDeleted(); }}><Trash2 className="me-1 h-4 w-4" />{text.deleted}</Button></div>
          <SavedMealPicker meals={pickerMeals} onPick={(id) => void openDetail(id)} disabled={loading} />
        </div> : null}

        {mode === "detail" && detail?.bundle ? <section className="mt-4 space-y-4" aria-label={text.detail}>
          <div><h3 className="text-xl font-semibold"><bdi dir="auto">{detail.savedMeal.name}</bdi></h3><p className="mt-1 text-sm text-muted-foreground"><span className="font-medium">{text.note}:</span> <bdi dir="auto">{detail.savedMeal.note || text.noNote}</bdi></p></div>
          <div><h4 className="text-sm font-semibold">{text.items}</h4><div className="mt-2 divide-y divide-border border-y border-border">{editorItems(detail.bundle).map((item) => <div key={item.id} className="py-3"><div className="text-sm font-medium"><bdi dir="auto">{item.name}</bdi></div><div className="text-xs text-muted-foreground"><bdi dir="auto">{item.servingLabel}</bdi></div></div>)}</div></div>
          <div className="flex flex-wrap gap-2"><Button type="button" onClick={beginEdit}>{text.edit}</Button><Button type="button" variant="destructive" disabled={busy} onClick={() => void removeCurrent()}>{busy ? text.deleting : text.remove}</Button></div>
        </section> : null}

        {editorMode ? <div className="mt-4"><SavedMealEditor
          mode={mode === "edit" ? "edit" : "create"}
          name={name}
          note={note}
          items={items}
          onNameChange={setName}
          onNoteChange={setNote}
          onAddFood={() => { setMode("add-food"); setQuery(""); setFoods([]); }}
          onAddRecipe={() => { setMode("add-recipe"); setQuery(""); setRecipes([]); }}
          onRemoveItem={(id) => setItems((current) => current.filter((item) => item.id !== id))}
          onSave={() => void save()}
          onCancel={() => detail ? setMode("detail") : setMode("browse")}
          busy={busy}
          error={error || null}
        /></div> : null}

        {selectionMode ? <section className="mt-4 space-y-3">
          <h3 className="font-semibold">{mode === "add-food" ? text.chooseFood : text.chooseRecipe}</h3>
          <div className="flex gap-2"><label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-border px-3"><Search className="h-4 w-4 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={mode === "add-food" ? text.searchFood : text.searchRecipe} className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label><Button type="button" variant="outline" onClick={() => void searchCandidates(mode === "add-food" ? "food" : "recipe")}>{text.search}</Button></div>
          <div className="divide-y divide-border border-y border-border">{mode === "add-food" ? foods.map((food) => <button key={`${food.source}:${food.id}`} type="button" onClick={() => addFood(food)} className="flex min-h-14 w-full items-center justify-between gap-3 py-2 text-start"><span><span className="block text-sm font-medium"><bdi dir="auto">{food.name}</bdi></span><span className="block text-xs text-muted-foreground"><bdi dir="auto">{food.servingLabel}</bdi></span></span><Plus className="h-4 w-4" /></button>) : recipes.map((recipe) => <button key={recipe.recipeId} type="button" onClick={() => addRecipe(recipe)} className="flex min-h-14 w-full items-center justify-between gap-3 py-2 text-start"><span><span className="block text-sm font-medium"><bdi dir="auto">{recipe.name}</bdi></span><span className="block text-xs text-muted-foreground">1 serving</span></span><Plus className="h-4 w-4" /></button>)}</div>
          {!loading && ((mode === "add-food" && !foods.length) || (mode === "add-recipe" && !recipes.length)) ? <p className="text-sm text-muted-foreground">{text.noMatches}</p> : null}
        </section> : null}

        {mode === "deleted" ? <div className="mt-4"><RecentlyDeletedSavedMeals items={deletedRows} onRestore={(id) => void lifecycle(id, "restore")} onDeleteNow={(id) => void lifecycle(id, "purge")} busyId={busyId} /></div> : null}
      </div>
    </div>
  );
}