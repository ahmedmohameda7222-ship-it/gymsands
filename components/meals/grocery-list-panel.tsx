"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Download, Plus, Printer, RefreshCw, Share2, ShoppingCart, Trash2, Undo2 } from "lucide-react";
import { AiActionRequestDialog } from "@/components/ai/ai-action-request-dialog";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Disclosure } from "@/components/ui/disclosure";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { userSafeError } from "@/lib/error-formatting";
import { deleteGroceryItem, getGroceryItems, upsertGroceryItem } from "@/services/database/execution-layer";
import type { GroceryStoreSection, MealPlanItem, UserGroceryItem } from "@/types";

const sections: GroceryStoreSection[] = ["Protein", "Carbs", "Vegetables", "Fruits", "Dairy", "Pantry", "Frozen", "Drinks", "Other"];
const commonUnits = ["g", "kg", "ml", "L", "pcs", "slices", "cups", "tbsp", "tsp", "pack", "can", "bottle", "bunch", "item"];

type LastImport = { ids: string[]; added: number; skipped: number };

export function GroceryListPanel({ weekStart, weekEnd, mealItems, refreshKey, onStats }: { weekStart: string; weekEnd: string; mealItems: MealPlanItem[]; refreshKey: number; onStats: (count: number, checked: number) => void }) {
  const { user } = useAuth();
  const userId = user?.id;
  const { toast } = useToast();
  const { dialog: confirmDialog, ask: confirmAsk } = useConfirm();
  const [items, setItems] = useState<UserGroceryItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastImport, setLastImport] = useState<LastImport | null>(null);
  const [feedback, setFeedback] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loadNonce, setLoadNonce] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [draft, setDraft] = useState({ itemName: "", quantity: "", unit: "", customUnit: "", section: "Other" as GroceryStoreSection, notes: "" });

  useEffect(() => {
    let active = true;
    async function load() {
      if (!userId) return;
      setIsLoading(true);
      setLoadError("");
      try {
        const savedItems = await getGroceryItems(userId, weekStart);
        if (active) {
          setItems(savedItems);
          setSelectedIds(new Set());
        }
      } catch (error) {
        if (active) {
          const message = userSafeError(error, "Please refresh and try again.");
          setLoadError(message);
          toast({ title: "Could not load grocery list", description: message });
        }
      } finally {
        if (active) setIsLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [loadNonce, refreshKey, toast, userId, weekStart]);

  useEffect(() => { onStats(items.length, items.filter((item) => item.checked).length); }, [items, onStats]);

  const grouped = useMemo(() => sections.map((section) => ({ section, items: items.filter((item) => item.store_section === section) })).filter((group) => group.items.length), [items]);
  const importedItems = useMemo(() => items.filter((item) => item.created_by === "meal_plan"), [items]);
  const selectedItems = useMemo(() => items.filter((item) => selectedIds.has(item.id)), [items, selectedIds]);
  const existingSourceIds = useMemo(() => new Set(items.map((item) => item.source_meal_plan_item_id).filter(Boolean)), [items]);
  const existingNames = useMemo(() => new Set(items.map((item) => normalizedName(item.item_name))), [items]);
  const importCandidates = useMemo(() => mealItems.filter((meal) => !existingSourceIds.has(meal.id) && !existingNames.has(normalizedName(meal.food_name))), [existingNames, existingSourceIds, mealItems]);
  const importSkipped = mealItems.length - importCandidates.length;

  async function addItem() {
    if (!user?.id || !draft.itemName.trim()) return;
    setIsBusy(true);
    try {
      const saved = await upsertGroceryItem(user.id, {
        week_start: weekStart,
        item_name: draft.itemName,
        quantity: draft.quantity ? Number(draft.quantity) : null,
        unit: draft.unit === "custom" ? draft.customUnit : draft.unit,
        store_section: draft.section,
        notes: draft.notes,
        created_by: "manual"
      });
      setItems((current) => [...current, saved]);
      setDraft({ itemName: "", quantity: "", unit: "", customUnit: "", section: "Other", notes: "" });
      setFeedback(`${saved.item_name} was added to this grocery list.`);
    } catch (error) {
      toast({ title: "Could not add grocery item", description: userSafeError(error) });
    } finally {
      setIsBusy(false);
    }
  }

  function confirmImport() {
    if (!mealItems.length) return;
    confirmAsk({
      title: "Import a rough grocery list?",
      description: `${importCandidates.length} meal name${importCandidates.length === 1 ? "" : "s"} can be added. This is a rough starting point, not an ingredient list, and ${importSkipped} duplicate${importSkipped === 1 ? "" : "s"} will be skipped.`,
      confirmLabel: `Import ${importCandidates.length}`,
      onConfirm: () => { void importMeals(); }
    });
  }

  async function importMeals() {
    if (!user?.id) return;
    if (!importCandidates.length) {
      const message = mealItems.length ? "Nothing was added because every meal is already represented in this list." : "There are no planned meals to import for this week.";
      setFeedback(message);
      toast({ title: "No new items to import", description: message });
      return;
    }
    setIsBusy(true);
    try {
      const saved = await Promise.all(importCandidates.map((meal) => upsertGroceryItem(user.id, {
        week_start: weekStart,
        source_meal_plan_item_id: meal.id,
        item_name: meal.food_name,
        quantity: meal.quantity,
        unit: meal.serving_size,
        store_section: "Other",
        notes: `From ${meal.meal_type} on ${meal.plan_date}`,
        created_by: "meal_plan"
      })));
      const skipped = mealItems.length - saved.length;
      setItems((current) => [...current, ...saved]);
      setLastImport({ ids: saved.map((item) => item.id), added: saved.length, skipped });
      setFeedback(`${saved.length} item${saved.length === 1 ? "" : "s"} imported. ${skipped} duplicate${skipped === 1 ? "" : "s"} skipped.`);
      toast({ title: "Rough list imported", description: `${saved.length} added · ${skipped} skipped. You can undo this import below.` });
    } catch (error) {
      toast({ title: "Could not import meal-plan items", description: userSafeError(error) });
    } finally {
      setIsBusy(false);
    }
  }

  async function undoLastImport() {
    if (!user?.id || !lastImport?.ids.length) return;
    setIsBusy(true);
    try {
      await Promise.all(lastImport.ids.map((id) => deleteGroceryItem(user.id, id)));
      setItems((current) => current.filter((item) => !lastImport.ids.includes(item.id)));
      setSelectedIds((current) => new Set([...current].filter((id) => !lastImport.ids.includes(id))));
      setFeedback(`Last import undone. ${lastImport.added} item${lastImport.added === 1 ? "" : "s"} removed.`);
      setLastImport(null);
      toast({ title: "Import undone", description: "Only items from the most recent import were removed." });
    } catch (error) {
      toast({ title: "Could not undo import", description: userSafeError(error) });
    } finally {
      setIsBusy(false);
    }
  }

  async function patchItem(item: UserGroceryItem, patch: Partial<UserGroceryItem>) {
    if (!user?.id) return;
    try {
      const saved = await upsertGroceryItem(user.id, { ...item, ...patch });
      setItems((current) => current.map((currentItem) => currentItem.id === saved.id ? saved : currentItem));
    } catch (error) {
      toast({ title: "Could not update grocery item", description: userSafeError(error) });
    }
  }

  async function patchSelected(patch: Partial<UserGroceryItem>, success: string) {
    if (!user?.id || !selectedItems.length) return;
    setIsBusy(true);
    try {
      const updated = await Promise.all(selectedItems.map((item) => upsertGroceryItem(user.id, { ...item, ...patch })));
      const updatedById = new Map(updated.map((item) => [item.id, item]));
      setItems((current) => current.map((item) => updatedById.get(item.id) ?? item));
      setFeedback(success);
      setSelectedIds(new Set());
    } catch (error) {
      toast({ title: "Could not update selected items", description: userSafeError(error) });
    } finally {
      setIsBusy(false);
    }
  }

  async function deleteItems(targets: UserGroceryItem[], success: string) {
    if (!user?.id || !targets.length) return;
    setIsBusy(true);
    try {
      await Promise.all(targets.map((item) => deleteGroceryItem(user.id, item.id)));
      const ids = new Set(targets.map((item) => item.id));
      setItems((current) => current.filter((item) => !ids.has(item.id)));
      setSelectedIds(new Set());
      setFeedback(success);
    } catch (error) {
      toast({ title: "Could not delete grocery items", description: userSafeError(error) });
    } finally {
      setIsBusy(false);
    }
  }

  function confirmDelete(targets: UserGroceryItem[], label: string, success: string) {
    if (!targets.length) return;
    confirmAsk({
      title: label,
      description: `${targets.length} item${targets.length === 1 ? "" : "s"} will be removed from this grocery list. This cannot be undone.`,
      confirmLabel: "Delete items",
      variant: "destructive",
      onConfirm: () => { void deleteItems(targets, success); }
    });
  }

  function toggleSelection(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const textList = items.map((item) => `${item.checked ? "✓" : "□"} ${item.item_name}${item.quantity !== null ? ` - ${item.quantity} ${item.unit ?? ""}` : ""}${item.already_have ? " (already have)" : ""}`).join("\n");

  function printList() {
    try {
      const win = window.open("", "_blank");
      if (!win) {
        setFeedback("The print window was blocked. Allow pop-ups for Plaivra and try again.");
        toast({ title: "Print window blocked", description: "Allow pop-ups for Plaivra, then try again.", variant: "error" });
        return;
      }
      win.document.write(`<!doctype html><html><head><title>Plaivra grocery list</title><style>body{font-family:Arial;padding:24px;white-space:pre-line}</style></head><body><h1>Grocery list ${weekStart} to ${weekEnd}</h1>${textList.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</body></html>`);
      win.document.close();
      win.print();
      setFeedback("Print view opened successfully.");
      toast({ title: "Print view opened", description: "Choose a printer or save as PDF in the browser dialog." });
    } catch (error) {
      toast({ title: "Could not print list", description: userSafeError(error), variant: "error" });
    }
  }

  async function shareList() {
    try {
      const canShare = typeof navigator.share === "function";
      if (canShare) await navigator.share({ title: "Plaivra grocery list", text: textList });
      else await navigator.clipboard.writeText(textList);
      setFeedback(canShare ? "Share sheet opened." : "Grocery list copied to the clipboard.");
      toast({ title: canShare ? "Share sheet opened" : "Grocery list copied" });
    } catch (error) {
      toast({ title: "Could not share list", description: userSafeError(error), variant: "error" });
    }
  }

  function exportCsv() {
    try {
      const rows = [["item", "quantity", "unit", "section", "checked", "already_have", "notes"], ...items.map((item) => [item.item_name, item.quantity ?? "", item.unit ?? "", item.store_section, item.checked, item.already_have, item.notes ?? ""])];
      const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `plaivra-grocery-${weekStart}.csv`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setFeedback(`Downloaded ${anchor.download}.`);
      toast({ title: "Grocery list downloaded", description: anchor.download });
    } catch (error) {
      toast({ title: "Could not download list", description: userSafeError(error), variant: "error" });
    }
  }

  return (
    <Card variant="glass">
      {confirmDialog}
      <CardHeader className="p-4 sm:p-5">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2"><ShoppingCart className="h-5 w-5" /> Grocery list</span>
          <span className="text-xs font-normal text-muted-foreground">{items.filter((item) => item.checked).length}/{items.length} checked</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-4 pt-0 sm:p-5 sm:pt-0">
        {feedback ? <div className="flex items-start gap-2 rounded-[14px] border border-primary/25 bg-primary/5 p-3 text-sm" role="status"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><p>{feedback}</p></div> : null}

        <div className="space-y-2">
          <Label htmlFor="grocery-quick-add">Quick add</Label>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_auto]">
            <Input id="grocery-quick-add" value={draft.itemName} onChange={(event) => setDraft((current) => ({ ...current, itemName: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") void addItem(); }} placeholder="Item name" />
            <select aria-label="Unit" value={draft.unit} onChange={(event) => setDraft((current) => ({ ...current, unit: event.target.value }))} className="h-11 w-full rounded-[14px] border bg-card px-3 text-sm">
              <option value="">Unit</option>
              {commonUnits.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
              <option value="custom">Other / custom</option>
            </select>
            <Button onClick={addItem} disabled={!draft.itemName.trim() || isBusy}><Plus className="h-4 w-4" /> Add</Button>
          </div>
          {draft.unit === "custom" ? <Input aria-label="Custom unit" value={draft.customUnit} onChange={(event) => setDraft((current) => ({ ...current, customUnit: event.target.value }))} placeholder="Enter a custom unit" /> : null}
        </div>

        <Disclosure title="Advanced details" description="Quantity, store section, and notes">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-2"><Label>Quantity</Label><Input type="number" value={draft.quantity} onChange={(event) => setDraft((current) => ({ ...current, quantity: event.target.value }))} /></div>
            <div className="space-y-2"><Label>Section</Label><select value={draft.section} onChange={(event) => setDraft((current) => ({ ...current, section: event.target.value as GroceryStoreSection }))} className="h-11 w-full rounded-[14px] border bg-card px-3 text-sm">{sections.map((section) => <option key={section}>{section}</option>)}</select></div>
            <div className="space-y-2"><Label>Notes</Label><Input value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="Optional" /></div>
          </div>
        </Disclosure>

        <AiActionRequestDialog actions={[{ type: "build_grocery_list", label: "Build ingredient list with ChatGPT", description: "Ask ChatGPT to turn planned meals into an ingredient-level list grouped by store section." }]} sourceType="grocery_week" sourceId={weekStart} context={{ week_start: weekStart, week_end: weekEnd, grocery_items: items, meal_plan_items: mealItems }} title="Ask ChatGPT for help" buttonVariant="default" className="grid" />

        <div className="rounded-[14px] border border-border/70 bg-muted/20 p-3">
          <p className="text-sm font-semibold">Rough meal-name import</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">Adds planned meal names as a starting point. It is not an ingredient list; duplicate names and already-imported meals are skipped.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Button variant="outline" onClick={confirmImport} disabled={!mealItems.length || isBusy}>Import {importCandidates.length} new item{importCandidates.length === 1 ? "" : "s"}</Button>
            <Button variant="ghost" onClick={undoLastImport} disabled={!lastImport || isBusy}><Undo2 className="h-4 w-4" /> Undo last import</Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Expected: {importCandidates.length} added · {importSkipped} skipped</p>
        </div>

        {items.length ? (
          <div className="space-y-2 rounded-[14px] border border-border/70 p-3">
            <p className="text-sm font-semibold">Bulk actions {selectedIds.size ? `· ${selectedIds.size} selected` : ""}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setSelectedIds(new Set(items.map((item) => item.id)))}>Select all</Button>
              <Button variant="outline" size="sm" onClick={() => setSelectedIds(new Set(importedItems.map((item) => item.id)))}>Select imported</Button>
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())} disabled={!selectedIds.size}>Clear selection</Button>
              <Button variant="outline" size="sm" onClick={() => void patchSelected({ already_have: true }, `${selectedItems.length} item${selectedItems.length === 1 ? "" : "s"} marked as already at home.`)} disabled={!selectedIds.size || isBusy}>Mark already have</Button>
              <Button variant="destructive" size="sm" onClick={() => confirmDelete(selectedItems, "Delete selected items?", "Selected items deleted.")} disabled={!selectedIds.size || isBusy}>Delete selected</Button>
              <Button variant="outline" size="sm" onClick={() => confirmDelete(items.filter((item) => item.checked), "Clear checked items?", "Checked items cleared.")} disabled={!items.some((item) => item.checked) || isBusy}>Clear checked</Button>
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => confirmDelete(items, "Clear the entire list?", "Grocery list cleared.")} disabled={isBusy}>Clear list</Button>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2 border-t border-border/60 pt-3">
          <Button variant="outline" size="sm" onClick={printList} disabled={!items.length}><Printer className="h-4 w-4" /> Print</Button>
          <Button variant="outline" size="sm" onClick={() => void shareList()} disabled={!items.length}><Share2 className="h-4 w-4" /> Share</Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!items.length}><Download className="h-4 w-4" /> Download list</Button>
          <AiActionRequestDialog actions={[{ type: "make_meal_cheaper", label: "Find cheaper options", description: "Ask ChatGPT for lower-cost substitutions for this grocery list." }]} sourceType="grocery_week" sourceId={weekStart} context={{ week_start: weekStart, week_end: weekEnd, grocery_items: items, meal_plan_items: mealItems }} title="Ask ChatGPT for help" buttonVariant="ghost" />
        </div>

        {isLoading ? <p className="text-sm text-muted-foreground">Loading grocery list...</p> : null}
        {!isLoading && loadError ? (
          <div className="rounded-[14px] border border-destructive/30 bg-destructive/5 p-4" role="alert">
            <p className="font-semibold text-foreground">Grocery list could not load</p>
            <p className="mt-1 text-sm text-muted-foreground">{loadError}</p>
            <Button className="mt-3" size="sm" onClick={() => setLoadNonce((current) => current + 1)}><RefreshCw className="h-4 w-4" /> Try again</Button>
          </div>
        ) : null}
        {!isLoading && !loadError && !items.length ? <p className="rounded-[14px] border border-dashed p-4 text-sm leading-6 text-muted-foreground">Your list is empty. Add an item, import meal names as a rough start, or ask ChatGPT to prepare an ingredient-level list that you review.</p> : null}

        {grouped.map((group) => (
          <div key={group.section}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group.section}</p>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {group.items.map((item) => (
                <div key={item.id} className={cn("solid-row space-y-3 p-3", item.checked && "opacity-75", selectedIds.has(item.id) && "border-2 border-primary")}>
                  <div className="flex items-start gap-3">
                    <input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => toggleSelection(item.id)} aria-label={`Select ${item.item_name}`} className="mt-0.5 h-6 w-6 shrink-0 accent-primary" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><p className={cn("font-semibold", item.checked && "line-through")}>{item.item_name}</p>{item.created_by === "meal_plan" ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">Imported</span> : null}</div>
                      <p className="text-xs text-muted-foreground">{item.quantity ?? "Qty not set"} {item.unit ?? ""}{item.notes ? ` · ${item.notes}` : ""}</p>
                    </div>
                    <Button type="button" variant="ghost" size="icon" className="shrink-0 text-destructive" onClick={() => confirmDelete([item], `Delete ${item.item_name}?`, `${item.item_name} deleted.`)} aria-label={`Delete ${item.item_name}`}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-primary" checked={item.checked} onChange={() => void patchItem(item, { checked: !item.checked })} /> Checked off</label>
                    <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-primary" checked={item.already_have} onChange={() => void patchItem(item, { already_have: !item.already_have })} /> Already have</label>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function normalizedName(value: string) {
  return value.trim().toLocaleLowerCase();
}
