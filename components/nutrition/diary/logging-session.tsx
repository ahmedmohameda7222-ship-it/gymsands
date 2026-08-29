"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import { PlateDock, type DiaryPlateItem, type DiaryPlateNutrition } from "@/components/nutrition/diary/plate-dock";
import { normalizeProductBarcode } from "@/lib/barcodes";
import { useEatTranslation } from "@/lib/i18n/eat";
import type { DiaryPlannedOccurrence, DiarySavedMealChoice } from "@/services/nutrition-v1/server/diary";
import type { FoodLibraryCandidate, FoodLibraryPage } from "@/services/nutrition-v1/server/food-library";
import type { RecipeHomeRecord } from "@/services/nutrition-v1/server/recipe-workspace";

export const DIARY_DRAFT_TTL_MS = 2 * 60 * 60 * 1000;

type LoggerMode = "search" | "barcode" | "quick-add" | "saved-meals" | "recipes";
type SubmitState = "editing" | "submitting" | "confirmed" | "failed";
type DraftPayload = { savedAt: number; plate: DiaryPlateItem[]; pendingOperationId?: string | null };
type BarcodeFood = { name: string; brand?: string | null; servingSize?: string | null; calories?: number | null; protein?: number | null; carbs?: number | null; fat?: number | null };

const nullFacts = (): DiaryPlateNutrition => ({ caloriesKcal: null, proteinG: null, carbsG: null, fatG: null });

const loggerCopy = {
  en: {
    logChangesFor: "Log changes for {meal}", addFoodTo: "Add food to {meal}", logWithChanges: "Log with changes", addFood: "Add Food",
    plannedDescription: "Adjust this Plate to match what you actually ate, then confirm once.", plateDescription: "Build one Plate, then log it when it matches what you ate.", closeLogger: "Close logger", tools: "Food logging tools",
    quickAdd: "Quick Add", recipes: "Recipes", placeholderUnverified: "This Placeholder is not verified food. Search, replace, or Quick Add what you actually ate before logging.",
    plannedUnresolved: "The planned item cannot be resolved automatically. Add what you actually ate before logging.", plannedLoaded: "Planned meal loaded into Plate. Adjust it to match what you actually ate.",
    searchUnavailable: "Food search is temporarily unavailable.", recipesUnavailable: "Recipes are temporarily unavailable.", addedToPlate: "{name} added to Plate.", enterValidBarcode: "Enter a valid barcode.",
    productFound: "Product found. Review it before adding to Plate.", barcodeFallback: "Barcode lookup failed. Use Search foods or Quick Add instead.", quickCaloriesRequired: "Quick Add requires valid calories.",
    loggingPlate: "Logging Plate…", plannedLogged: "Planned meal logged with changes.", plateLogged: "Plate logged.", plateFailed: "Plate was not logged. Your items are preserved for retry.",
    scanOrEnter: "Scan with a supported platform or enter the barcode. The resolved product stays in this Plate until you confirm logging.", addToPlate: "Add to Plate", caloriesRequired: "Calories are required. Unknown macros stay unknown.",
    optionalName: "Name (optional)", optionalProtein: "Protein g (optional)", optionalCarbs: "Carbs g (optional)", optionalFat: "Fat g (optional)", savedMealDescription: "Add a frozen reusable bundle, then adjust the Plate before logging if needed.",
    noSavedMeals: "No Saved Meals yet.", recipeDescription: "Only published Recipe versions can be logged as finished intake.", noRecipes: "No published Recipes available.", serving: "1 serving", entry: "1 entry", item: "item", items: "items",
  },
  de: {
    logChangesFor: "Änderungen für {meal} protokollieren", addFoodTo: "Lebensmittel zu {meal} hinzufügen", logWithChanges: "Mit Änderungen protokollieren", addFood: "Lebensmittel hinzufügen",
    plannedDescription: "Passe diesen Teller an das tatsächlich Gegessene an und bestätige dann einmal.", plateDescription: "Stelle einen Teller zusammen und protokolliere ihn, sobald er dem Gegessenen entspricht.", closeLogger: "Protokollierung schließen", tools: "Werkzeuge zur Ernährungsprotokollierung",
    quickAdd: "Schnelleingabe", recipes: "Rezepte", placeholderUnverified: "Dieser Platzhalter ist kein verifiziertes Lebensmittel. Suche, ersetze oder erfasse das tatsächlich Gegessene per Schnelleingabe.",
    plannedUnresolved: "Der geplante Eintrag kann nicht automatisch aufgelöst werden. Füge vor der Protokollierung das tatsächlich Gegessene hinzu.", plannedLoaded: "Geplante Mahlzeit in den Teller geladen. Passe ihn an das tatsächlich Gegessene an.",
    searchUnavailable: "Die Lebensmittelsuche ist vorübergehend nicht verfügbar.", recipesUnavailable: "Rezepte sind vorübergehend nicht verfügbar.", addedToPlate: "{name} zum Teller hinzugefügt.", enterValidBarcode: "Gib einen gültigen Barcode ein.",
    productFound: "Produkt gefunden. Prüfe es vor dem Hinzufügen.", barcodeFallback: "Barcode-Suche fehlgeschlagen. Verwende Lebensmittelsuche oder Schnelleingabe.", quickCaloriesRequired: "Die Schnelleingabe benötigt gültige Kalorien.",
    loggingPlate: "Teller wird protokolliert…", plannedLogged: "Geplante Mahlzeit mit Änderungen protokolliert.", plateLogged: "Teller protokolliert.", plateFailed: "Der Teller wurde nicht protokolliert. Deine Einträge bleiben für einen erneuten Versuch erhalten.",
    scanOrEnter: "Scanne auf einer unterstützten Plattform oder gib den Barcode ein. Das aufgelöste Produkt bleibt bis zur Bestätigung auf diesem Teller.", addToPlate: "Zum Teller hinzufügen", caloriesRequired: "Kalorien sind erforderlich. Unbekannte Makros bleiben unbekannt.",
    optionalName: "Name (optional)", optionalProtein: "Protein g (optional)", optionalCarbs: "Kohlenhydrate g (optional)", optionalFat: "Fett g (optional)", savedMealDescription: "Füge ein eingefrorenes wiederverwendbares Paket hinzu und passe den Teller bei Bedarf vor der Protokollierung an.",
    noSavedMeals: "Noch keine gespeicherten Mahlzeiten.", recipeDescription: "Nur veröffentlichte Rezeptversionen können als fertige Aufnahme protokolliert werden.", noRecipes: "Keine veröffentlichten Rezepte verfügbar.", serving: "1 Portion", entry: "1 Eintrag", item: "Eintrag", items: "Einträge",
  },
  ar: {
    logChangesFor: "تسجيل التغييرات لـ {meal}", addFoodTo: "إضافة طعام إلى {meal}", logWithChanges: "التسجيل مع التغييرات", addFood: "إضافة طعام",
    plannedDescription: "عدّل هذا الطبق ليطابق ما أكلته فعليًا، ثم أكّد مرة واحدة.", plateDescription: "كوّن طبقًا واحدًا ثم سجله عندما يطابق ما أكلته.", closeLogger: "إغلاق التسجيل", tools: "أدوات تسجيل الطعام",
    quickAdd: "إضافة سريعة", recipes: "الوصفات", placeholderUnverified: "هذا العنصر المؤقت ليس طعامًا موثقًا. ابحث أو استبدله أو استخدم الإضافة السريعة لما أكلته فعليًا قبل التسجيل.",
    plannedUnresolved: "لا يمكن تحديد العنصر المخطط تلقائيًا. أضف ما أكلته فعليًا قبل التسجيل.", plannedLoaded: "تم تحميل الوجبة المخططة إلى الطبق. عدّلها لتطابق ما أكلته فعليًا.",
    searchUnavailable: "بحث الأطعمة غير متاح مؤقتًا.", recipesUnavailable: "الوصفات غير متاحة مؤقتًا.", addedToPlate: "تمت إضافة {name} إلى الطبق.", enterValidBarcode: "أدخل باركود صالحًا.",
    productFound: "تم العثور على المنتج. راجعه قبل إضافته إلى الطبق.", barcodeFallback: "فشل البحث بالباركود. استخدم بحث الأطعمة أو الإضافة السريعة بدلًا منه.", quickCaloriesRequired: "تتطلب الإضافة السريعة قيمة سعرات صالحة.",
    loggingPlate: "جارٍ تسجيل الطبق…", plannedLogged: "تم تسجيل الوجبة المخططة مع التغييرات.", plateLogged: "تم تسجيل الطبق.", plateFailed: "لم يتم تسجيل الطبق. تم الاحتفاظ بعناصرك لإعادة المحاولة.",
    scanOrEnter: "امسح الباركود بمنصة مدعومة أو أدخله. يظل المنتج المحدد في هذا الطبق حتى تؤكد التسجيل.", addToPlate: "إضافة إلى الطبق", caloriesRequired: "السعرات مطلوبة. الماكروز غير المعروفة تظل غير معروفة.",
    optionalName: "الاسم (اختياري)", optionalProtein: "البروتين غ (اختياري)", optionalCarbs: "الكربوهيدرات غ (اختياري)", optionalFat: "الدهون غ (اختياري)", savedMealDescription: "أضف حزمة محفوظة مجمدة ثم عدّل الطبق قبل التسجيل عند الحاجة.",
    noSavedMeals: "لا توجد وجبات محفوظة بعد.", recipeDescription: "يمكن تسجيل نسخ الوصفات المنشورة فقط كمدخول مكتمل.", noRecipes: "لا توجد وصفات منشورة متاحة.", serving: "حصة واحدة", entry: "إدخال واحد", item: "عنصر", items: "عناصر",
  },
} as const;

function authHeaders(token?: string | null, json = false) {
  return { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(json ? { "Content-Type": "application/json" } : {}) };
}
function draftKey(userId: string, date: string, meal: string, plannedOccurrenceId?: string | null) { return `plaivra:nutrition-v1:diary-draft:${userId}:${date}:${meal}${plannedOccurrenceId ? `:planned:${plannedOccurrenceId}` : ""}`; }
function legacyDraftKey(date: string, meal: string, plannedOccurrenceId?: string | null) { return `plaivra:nutrition-v1:diary-draft:${date}:${meal}${plannedOccurrenceId ? `:planned:${plannedOccurrenceId}` : ""}`; }
function known(value: unknown) { if (value === null || value === undefined || value === "") return null; const number = Number(value); return Number.isFinite(number) && number >= 0 ? number : null; }
function positiveOr(value: unknown, fallback: number) { const number = Number(value); return Number.isFinite(number) && number > 0 ? number : fallback; }
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function scaleFacts(value: DiaryPlateNutrition, scale: number): DiaryPlateNutrition { return { caloriesKcal: value.caloriesKcal === null ? null : value.caloriesKcal * scale, proteinG: value.proteinG === null ? null : value.proteinG * scale, carbsG: value.carbsG === null ? null : value.carbsG * scale, fatG: value.fatG === null ? null : value.fatG * scale }; }
function snakeFacts(value: unknown): DiaryPlateNutrition { const row = record(value); return { caloriesKcal: known(row.calories), proteinG: known(row.protein_g), carbsG: known(row.carbs_g), fatG: known(row.fat_g) }; }
function plannedFacts(value: unknown): DiaryPlateNutrition { const row = record(value); return { caloriesKcal: known(row.caloriesKcal ?? row.calories), proteinG: known(row.proteinG ?? row.protein_g), carbsG: known(row.carbsG ?? row.carbs_g), fatG: known(row.fatG ?? row.fat_g) }; }

export function plannedOccurrenceToPlate(plannedOccurrence: DiaryPlannedOccurrence): DiaryPlateItem[] {
  if (plannedOccurrence.sourceType === "placeholder") return [];
  const frozenSnapshot = plannedOccurrence.frozenSnapshot;
  const rawItems = Array.isArray(frozenSnapshot.items) ? frozenSnapshot.items : [];
  return rawItems.flatMap((raw, index) => {
    const item = record(raw);
    const foodName = typeof item.foodName === "string" && item.foodName.trim() ? item.foodName.trim() : plannedOccurrence.name;
    const servingLabel = typeof item.servingLabel === "string" && item.servingLabel.trim() ? item.servingLabel.trim() : "1 serving";
    const quantity = positiveOr(item.quantity, 1);
    return [{ id: `planned:${plannedOccurrence.id}:${index}`, foodName, servingLabel, quantity, nutrition: plannedFacts(item.nutrition), foodItemId: typeof item.foodItemId === "string" ? item.foodItemId : null, userFoodItemId: typeof item.userFoodItemId === "string" ? item.userFoodItemId : null, notes: typeof item.notes === "string" ? item.notes : null, source: { type: "planned_occurrence" as const, id: plannedOccurrence.id, frozenSnapshot } }];
  });
}

function sourceForPlate(plate: DiaryPlateItem[]) {
  if (plate.length === 1) { const source = plate[0].source; if (source.type === "recipe") return { type: "recipe" as const, id: source.id, versionId: source.recipeVersionId, frozenSnapshot: source.frozenSnapshot }; return source; }
  const first = plate[0]?.source;
  if (first?.type === "saved_meal" && plate.every((item) => item.source.type === "saved_meal" && item.source.id === first.id)) return { type: "saved_meal" as const, id: first.id, frozenSnapshot: { ...first.frozenSnapshot, actualItems: plate } };
  if (first?.type === "recipe" && plate.every((item) => item.source.type === "recipe" && item.source.id === first.id && item.source.recipeVersionId === first.recipeVersionId)) return { type: "recipe" as const, id: first.id, versionId: first.recipeVersionId, frozenSnapshot: { ...first.frozenSnapshot, actualItems: plate } };
  return { type: "food" as const, id: null, frozenSnapshot: { kind: "plate", items: plate.map((item) => ({ source: item.source, foodName: item.foodName, servingLabel: item.servingLabel, quantity: item.quantity, nutrition: item.nutrition })) } };
}
function executionItems(plate: DiaryPlateItem[]) { return plate.map((item) => ({ foodName: item.foodName, servingLabel: item.servingLabel, quantity: item.quantity, nutrition: item.nutrition, foodItemId: item.foodItemId ?? null, userFoodItemId: item.userFoodItemId ?? null, notes: item.notes ?? null })); }

export function LoggingSession({ date, meal, savedMeals, plannedOccurrence = null, onClose, onConfirmed }: { date: string; meal: string; savedMeals: DiarySavedMealChoice[]; plannedOccurrence?: DiaryPlannedOccurrence | null; onClose: () => void; onConfirmed: () => void; }) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const token = session?.access_token;
  const { et, language, dir, mealLabel } = useEatTranslation();
  const text = loggerCopy[language];
  const localizedMeal = mealLabel(meal);
  const [mode, setMode] = useState<LoggerMode>("search");
  const [plate, setPlate] = useState<DiaryPlateItem[]>([]);
  const [pendingOperationId, setPendingOperationId] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState>("editing");
  const [feedback, setFeedback] = useState("");
  const [query, setQuery] = useState("");
  const [foods, setFoods] = useState<FoodLibraryCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [barcode, setBarcode] = useState("");
  const [barcodeFood, setBarcodeFood] = useState<BarcodeFood | null>(null);
  const [recipes, setRecipes] = useState<RecipeHomeRecord[]>([]);
  const [quickCalories, setQuickCalories] = useState("");
  const [quickProtein, setQuickProtein] = useState("");
  const [quickCarbs, setQuickCarbs] = useState("");
  const [quickFat, setQuickFat] = useState("");
  const [quickName, setQuickName] = useState("");
  const key = useMemo(() => userId ? draftKey(userId, date, meal, plannedOccurrence?.id) : null, [date, meal, plannedOccurrence?.id, userId]);

  useEffect(() => {
    if (!userId) return;
    const scopedKey = draftKey(userId, date, meal, plannedOccurrence?.id);
    localStorage.removeItem(legacyDraftKey(date, meal, plannedOccurrence?.id));
    setPlate([]);
    setPendingOperationId(null);
    const stored = localStorage.getItem(scopedKey);
    if (!stored) return;
    try {
      const draft = JSON.parse(stored) as DraftPayload;
      if (Date.now() - draft.savedAt <= DIARY_DRAFT_TTL_MS && Array.isArray(draft.plate)) {
        setPlate(draft.plate);
        setPendingOperationId(typeof draft.pendingOperationId === "string" && draft.pendingOperationId ? draft.pendingOperationId : null);
      } else localStorage.removeItem(scopedKey);
    } catch {
      localStorage.removeItem(scopedKey);
    }
  }, [date, meal, plannedOccurrence?.id, userId]);
  useEffect(() => {
    if (!plannedOccurrence) return;
    if (plannedOccurrence.sourceType === "placeholder") { setFeedback(text.placeholderUnverified); return; }
    const seed = plannedOccurrenceToPlate(plannedOccurrence);
    if (!seed.length) { setFeedback(text.plannedUnresolved); return; }
    setPlate((current) => current.length ? current : seed); setFeedback(text.plannedLoaded);
  }, [plannedOccurrence, text.placeholderUnverified, text.plannedLoaded, text.plannedUnresolved]);
  useEffect(() => {
    if (!userId) return;
    if (plate.length) localStorage.setItem(draftKey(userId, date, meal, plannedOccurrence?.id), JSON.stringify({ savedAt: Date.now(), plate, pendingOperationId } satisfies DraftPayload));
  }, [date, meal, pendingOperationId, plannedOccurrence?.id, plate, userId]);
  const clearConfirmedDraft = useCallback(() => { if (key) localStorage.removeItem(key); }, [key]);

  useEffect(() => {
    if (mode !== "search") return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({ q: query, limit: "20", locale: language });
        const response = await fetch(`/api/nutrition/v1/foods?${params}`, { signal: controller.signal, headers: authHeaders(token) });
        if (!response.ok) throw new Error();
        const data = await response.json() as FoodLibraryPage; setFoods(data.items);
      } catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) setFeedback(text.searchUnavailable); }
      finally { setSearching(false); }
    }, 120);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [language, mode, query, text.searchUnavailable, token]);

  useEffect(() => {
    if (mode !== "recipes") return;
    void (async () => { try { const response = await fetch("/api/nutrition/v1/recipes?limit=24", { headers: authHeaders(token) }); if (!response.ok) throw new Error(); const data = await response.json() as { recipes?: RecipeHomeRecord[] }; setRecipes((data.recipes ?? []).filter((recipe) => recipe.status === "published" && Boolean(recipe.recipeVersionId))); } catch { setFeedback(text.recipesUnavailable); } })();
  }, [mode, text.recipesUnavailable, token]);

  function pushItem(item: Omit<DiaryPlateItem, "id">) { setPendingOperationId(null); setPlate((current) => [...current, { ...item, id: crypto.randomUUID() }]); setSubmitState("editing"); setFeedback(text.addedToPlate.replace("{name}", item.foodName)); }
  function addFood(food: FoodLibraryCandidate) { const nutrition = { caloriesKcal: food.nutrition.calories, proteinG: food.nutrition.protein_g, carbsG: food.nutrition.carbs_g, fatG: food.nutrition.fat_g }; const frozenSnapshot = { name: food.name, servingLabel: food.servingLabel, nutrition, verified: food.verified, source: food.source }; pushItem({ foodName: food.name, servingLabel: food.servingLabel, quantity: 1, nutrition, foodItemId: food.source === "catalog" ? food.id : null, userFoodItemId: food.source === "my_food" ? food.id : null, source: { type: "food", id: food.id, frozenSnapshot } }); }

  async function lookupBarcode() {
    const clean = normalizeProductBarcode(barcode); if (!clean) { setFeedback(text.enterValidBarcode); return; }
    try { const response = await fetch(`/api/food/open-food-facts?barcode=${encodeURIComponent(clean)}`, { headers: authHeaders(token) }); const data = await response.json().catch(() => ({})) as { food?: BarcodeFood }; if (!response.ok || !data.food) throw new Error(); setBarcode(clean); setBarcodeFood(data.food); setFeedback(text.productFound); }
    catch { setBarcodeFood(null); setFeedback(text.barcodeFallback); }
  }
  function addBarcodeFood() { if (!barcodeFood) return; const nutrition = { caloriesKcal: known(barcodeFood.calories), proteinG: known(barcodeFood.protein), carbsG: known(barcodeFood.carbs), fatG: known(barcodeFood.fat) }; pushItem({ foodName: barcodeFood.name, servingLabel: barcodeFood.servingSize?.trim() || text.serving, quantity: 1, nutrition, source: { type: "food", id: null, frozenSnapshot: { barcode, name: barcodeFood.name, brand: barcodeFood.brand ?? null, servingLabel: barcodeFood.servingSize ?? null, nutrition } } }); }
  function addQuick() { const calories = Number(quickCalories); if (!Number.isFinite(calories) || calories < 0) { setFeedback(text.quickCaloriesRequired); return; } const optional = (value: string) => value.trim() === "" ? null : known(value); const nutrition = { caloriesKcal: calories, proteinG: optional(quickProtein), carbsG: optional(quickCarbs), fatG: optional(quickFat) }; const name = quickName.trim() || `${Math.round(calories)} kcal`; pushItem({ foodName: name, servingLabel: text.entry, quantity: 1, nutrition, source: { type: "quick_add", frozenSnapshot: { name, nutrition } } }); setQuickCalories(""); setQuickProtein(""); setQuickCarbs(""); setQuickFat(""); setQuickName(""); }
  function addRecipe(recipe: RecipeHomeRecord) { if (!recipe.recipeVersionId) return; const nutrition = recipe.nutritionPerServing ? { caloriesKcal: recipe.nutritionPerServing.calories, proteinG: recipe.nutritionPerServing.protein_g, carbsG: recipe.nutritionPerServing.carbs_g, fatG: recipe.nutritionPerServing.fat_g } : nullFacts(); const frozenSnapshot = { name: recipe.name, recipeId: recipe.recipeId, recipeVersionId: recipe.recipeVersionId, serving: { quantity: 1, label: text.serving }, nutrition }; pushItem({ foodName: recipe.name, servingLabel: text.serving, quantity: 1, nutrition, source: { type: "recipe", id: recipe.recipeId, recipeVersionId: recipe.recipeVersionId, frozenSnapshot } }); }
  function addSavedMeal(mealChoice: DiarySavedMealChoice) { const bundle = mealChoice.bundle; for (const raw of bundle.items) { if (raw.kind === "food") { const nutrition = snakeFacts(raw.frozen_nutrition); pushItem({ foodName: String(raw.frozen_name ?? et("product")), servingLabel: String(raw.resolved_serving_label ?? et("serving")), quantity: Number(raw.resolved_quantity ?? 1), nutrition, foodItemId: typeof raw.food_id === "string" ? raw.food_id : null, source: { type: "saved_meal", id: mealChoice.id, frozenSnapshot: bundle } }); } else if (raw.kind === "recipe") { const recipe = raw.recipe && typeof raw.recipe === "object" && !Array.isArray(raw.recipe) ? raw.recipe as Record<string, unknown> : {}; const nutrition = snakeFacts(recipe.frozen_nutrition); pushItem({ foodName: String(recipe.frozen_recipe_name ?? text.recipes), servingLabel: String(recipe.resolved_serving_label ?? et("serving")), quantity: Number(recipe.resolved_serving_quantity ?? 1), nutrition, source: { type: "saved_meal", id: mealChoice.id, frozenSnapshot: bundle } }); } } }
  function updateQuantity(id: string, quantity: number) { if (!Number.isFinite(quantity) || quantity <= 0) return; setPendingOperationId(null); setPlate((current) => current.map((item) => item.id === id ? { ...item, nutrition: scaleFacts(item.nutrition, quantity / item.quantity), quantity } : item)); setSubmitState("editing"); }
  function removePlateItem(id: string) { setPendingOperationId(null); setPlate((current) => current.filter((item) => item.id !== id)); setSubmitState("editing"); }

  async function submitPlate() {
    if (!plate.length || submitState === "submitting") return;
    const operationId = pendingOperationId ?? crypto.randomUUID();
    if (!pendingOperationId) {
      setPendingOperationId(operationId);
      if (key) localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), plate, pendingOperationId: operationId } satisfies DraftPayload));
    }
    setSubmitState("submitting"); setFeedback(text.loggingPlate);
    try { const executionSnapshot = plannedOccurrence ? { ...plannedOccurrence.frozenSnapshot, items: executionItems(plate), actualItems: plate, actualSource: sourceForPlate(plate) } : null; const payload = plannedOccurrence ? { kind: "complete_planned", occurrenceId: plannedOccurrence.id, operationId, executionSnapshot } : { operationId, date, meal, source: sourceForPlate(plate), items: plate }; const response = await fetch("/api/nutrition/v1/log", { method: "POST", headers: authHeaders(token, true), body: JSON.stringify(payload) }); if (!response.ok) throw new Error(); setSubmitState("confirmed"); setPendingOperationId(null); clearConfirmedDraft(); setPlate([]); setFeedback(plannedOccurrence ? text.plannedLogged : text.plateLogged); onConfirmed(); }
    catch { setSubmitState("failed"); setFeedback(text.plateFailed); }
  }

  const modes: Array<{ value: LoggerMode; label: string }> = [
    { value: "search", label: et("searchFoods") }, { value: "barcode", label: et("barcode") }, { value: "quick-add", label: text.quickAdd }, { value: "saved-meals", label: et("savedMeals") }, { value: "recipes", label: text.recipes },
  ];
  const dialogLabel = (plannedOccurrence ? text.logChangesFor : text.addFoodTo).replace("{meal}", localizedMeal);
  const itemLabel = (count: number) => count === 1 ? text.item : text.items;

  return (
    <div dir={dir} className="fixed inset-0 z-50 bg-black/45 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={dialogLabel}>
      <div className="mx-auto flex max-h-[calc(100vh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-xl sm:max-h-[calc(100vh-3rem)]">
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3"><div><h2 className="font-semibold">{plannedOccurrence ? text.logWithChanges : text.addFood} · {localizedMeal}</h2><p className="text-xs text-muted-foreground">{plannedOccurrence ? text.plannedDescription : text.plateDescription}</p></div><button type="button" onClick={onClose} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl hover:bg-muted" aria-label={text.closeLogger}><X className="h-5 w-5" /></button></header>
        <nav className="flex gap-1 overflow-x-auto border-b border-border px-3 py-2" aria-label={text.tools}>{modes.map((item) => <button key={item.value} type="button" aria-pressed={mode === item.value} onClick={() => setMode(item.value)} className="min-h-11 shrink-0 rounded-xl px-3 text-sm font-medium aria-pressed:bg-foreground aria-pressed:text-background">{item.label}</button>)}</nav>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {mode === "search" ? <section className="space-y-3"><label className="flex min-h-12 items-center gap-2 rounded-xl border border-border px-3"><Search className="h-4 w-4 text-muted-foreground" /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={et("searchFoods")} className="w-full bg-transparent text-sm outline-none" /></label>{searching && !foods.length ? <p className="text-sm text-muted-foreground">{et("loading")}</p> : <div className="divide-y divide-border">{foods.map((food) => <div key={`${food.source}:${food.id}`} className="flex min-h-[72px] items-center gap-3 py-2"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold"><bdi dir="auto">{food.name}</bdi></p><p className="text-xs text-muted-foreground"><bdi dir="auto">{food.servingLabel}</bdi> · {food.nutrition.calories ?? "—"} kcal · {et("protein")} {food.nutrition.protein_g ?? "—"} g</p></div><button type="button" onClick={() => addFood(food)} className="min-h-11 rounded-xl border border-border px-3 text-sm font-medium hover:bg-muted">{et("add")}</button></div>)}</div>}</section> : null}
          {mode === "barcode" ? <section className="space-y-3"><h3 className="font-semibold">{et("barcode")}</h3><p className="text-sm text-muted-foreground">{text.scanOrEnter}</p><div className="flex gap-2"><input inputMode="numeric" value={barcode} onChange={(event) => { setBarcode(event.target.value.replace(/\D/g, "")); setBarcodeFood(null); }} placeholder={et("barcodePlaceholder")} className="min-h-12 flex-1 rounded-xl border border-border bg-background px-3 text-sm" /><button type="button" onClick={() => void lookupBarcode()} className="min-h-12 rounded-xl border border-border px-4 text-sm font-medium">{et("lookup")}</button></div>{barcodeFood ? <div className="flex items-center gap-3 border-y border-border py-3"><div className="min-w-0 flex-1"><p className="font-semibold"><bdi dir="auto">{barcodeFood.name}</bdi></p><p className="text-sm text-muted-foreground"><bdi dir="auto">{barcodeFood.servingSize ?? et("serving")}</bdi> · {barcodeFood.calories ?? "—"} kcal</p></div><button type="button" onClick={addBarcodeFood} className="min-h-11 rounded-xl bg-foreground px-4 text-sm font-semibold text-background">{text.addToPlate}</button></div> : null}</section> : null}
          {mode === "quick-add" ? <section className="space-y-3"><div><h3 className="font-semibold">{text.quickAdd}</h3><p className="text-sm text-muted-foreground">{text.caloriesRequired}</p></div><div className="grid gap-2 sm:grid-cols-2"><input value={quickName} onChange={(event) => setQuickName(event.target.value)} placeholder={text.optionalName} className="min-h-12 rounded-xl border border-border bg-background px-3 text-sm" /><input value={quickCalories} onChange={(event) => setQuickCalories(event.target.value)} type="number" min="0" placeholder={et("calories")} className="min-h-12 rounded-xl border border-border bg-background px-3 text-sm" /><input value={quickProtein} onChange={(event) => setQuickProtein(event.target.value)} type="number" min="0" placeholder={text.optionalProtein} className="min-h-12 rounded-xl border border-border bg-background px-3 text-sm" /><input value={quickCarbs} onChange={(event) => setQuickCarbs(event.target.value)} type="number" min="0" placeholder={text.optionalCarbs} className="min-h-12 rounded-xl border border-border bg-background px-3 text-sm" /><input value={quickFat} onChange={(event) => setQuickFat(event.target.value)} type="number" min="0" placeholder={text.optionalFat} className="min-h-12 rounded-xl border border-border bg-background px-3 text-sm" /></div><button type="button" onClick={addQuick} className="min-h-11 rounded-xl bg-foreground px-4 text-sm font-semibold text-background">{text.addToPlate}</button></section> : null}
          {mode === "saved-meals" ? <section className="space-y-3"><div><h3 className="font-semibold">{et("savedMeals")}</h3><p className="text-sm text-muted-foreground">{text.savedMealDescription}</p></div>{savedMeals.length ? <div className="divide-y divide-border">{savedMeals.map((saved) => <div key={saved.id} className="flex min-h-16 items-center gap-3 py-2"><div className="min-w-0 flex-1"><p className="font-semibold"><bdi dir="auto">{saved.name}</bdi></p><p className="text-xs text-muted-foreground">{saved.bundle.items.length} {itemLabel(saved.bundle.items.length)}</p></div><button type="button" onClick={() => addSavedMeal(saved)} className="min-h-11 rounded-xl border border-border px-3 text-sm font-medium">{text.addToPlate}</button></div>)}</div> : <p className="text-sm text-muted-foreground">{text.noSavedMeals}</p>}</section> : null}
          {mode === "recipes" ? <section className="space-y-3"><div><h3 className="font-semibold">{text.recipes}</h3><p className="text-sm text-muted-foreground">{text.recipeDescription}</p></div>{recipes.length ? <div className="divide-y divide-border">{recipes.map((recipe) => <div key={recipe.recipeId} className="flex min-h-16 items-center gap-3 py-2"><div className="min-w-0 flex-1"><p className="font-semibold"><bdi dir="auto">{recipe.name}</bdi></p><p className="text-xs text-muted-foreground">{text.serving} · {recipe.nutritionPerServing?.calories ?? "—"} kcal</p></div><button type="button" onClick={() => addRecipe(recipe)} className="min-h-11 rounded-xl border border-border px-3 text-sm font-medium">{text.addToPlate}</button></div>)}</div> : <p className="text-sm text-muted-foreground">{text.noRecipes}</p>}</section> : null}
          {feedback ? <p className="mt-4 text-sm text-muted-foreground" aria-live="polite">{feedback}</p> : null}
          <PlateDock plate={plate} pending={submitState === "submitting"} onQuantityChange={updateQuantity} onRemove={removePlateItem} onSubmit={() => void submitPlate()} />
        </div>
      </div>
    </div>
  );
}
