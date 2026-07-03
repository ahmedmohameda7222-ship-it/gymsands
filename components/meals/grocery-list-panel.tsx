"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Plus, Printer, Share2, ShoppingCart, Trash2 } from "lucide-react";
import { AiActionRequestDialog } from "@/components/ai/ai-action-request-dialog";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Disclosure } from "@/components/ui/disclosure";
import { useToast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { userSafeError } from "@/lib/error-formatting";
import { deleteGroceryItem, getGroceryItems, upsertGroceryItem } from "@/services/database/execution-layer";
import type { GroceryStoreSection, MealPlanItem, UserGroceryItem } from "@/types";

const sections: GroceryStoreSection[] = ["Protein", "Carbs", "Vegetables", "Fruits", "Dairy", "Pantry", "Frozen", "Drinks", "Other"];

export function GroceryListPanel({ weekStart, weekEnd, mealItems, refreshKey, onStats }: { weekStart: string; weekEnd: string; mealItems: MealPlanItem[]; refreshKey: number; onStats: (count: number, checked: number) => void }) {
  const { user } = useAuth();
  const userId = user?.id;
  const { toast } = useToast();
  const [items, setItems] = useState<UserGroceryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [draft, setDraft] = useState({ itemName: "", quantity: "", unit: "", section: "Other" as GroceryStoreSection, notes: "" });

  useEffect(() => {
    let active = true;
    async function load() {
      if (!userId) return;
      setIsLoading(true);
      try {
        const savedItems = await getGroceryItems(userId, weekStart);
        if (active) setItems(savedItems);
      } catch (error) {
        if (active) toast({ title: "Could not load grocery list", description: userSafeError(error, "Please refresh and try again.") });
      } finally {
        if (active) setIsLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [refreshKey, toast, userId, weekStart]);
  useEffect(() => { onStats(items.length, items.filter((item) => item.checked).length); }, [items, onStats]);

  const grouped = useMemo(() => sections.map((section) => ({ section, items: items.filter((item) => item.store_section === section) })).filter((group) => group.items.length), [items]);

  async function addItem() {
    if (!user?.id || !draft.itemName.trim()) return;
    try {
      const saved = await upsertGroceryItem(user.id, {
        week_start: weekStart,
        item_name: draft.itemName,
        quantity: draft.quantity ? Number(draft.quantity) : null,
        unit: draft.unit,
        store_section: draft.section,
        notes: draft.notes,
        created_by: "manual"
      });
      setItems((current) => [...current, saved]);
      setDraft({ itemName: "", quantity: "", unit: "", section: "Other", notes: "" });
    } catch (error) {
      toast({ title: "Could not add grocery item", description: userSafeError(error) });
    }
  }

  async function importMeals() {
    if (!user?.id) return;
    const existingSources = new Set(items.map((item) => item.source_meal_plan_item_id).filter(Boolean));
    const additions = mealItems.filter((meal) => !existingSources.has(meal.id));
    try {
      const saved = await Promise.all(additions.map((meal) => upsertGroceryItem(user.id, {
        week_start: weekStart,
        source_meal_plan_item_id: meal.id,
        item_name: meal.food_name,
        quantity: meal.quantity,
        unit: meal.serving_size,
        store_section: "Other",
        notes: `From ${meal.meal_type} on ${meal.plan_date}`,
        created_by: "meal_plan"
      })));
      setItems((current) => [...current, ...saved]);
      toast({ title: "Rough list imported", description: `${saved.length} meal name${saved.length === 1 ? "" : "s"} added. Use ChatGPT when you want an ingredient-level list.` });
    } catch (error) {
      toast({ title: "Could not import meal-plan items", description: userSafeError(error) });
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

  async function remove(item: UserGroceryItem) {
    if (!user?.id) return;
    await deleteGroceryItem(user.id, item.id);
    setItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
  }

  const textList = items.map((item) => `${item.checked ? "✓" : "□"} ${item.item_name}${item.quantity !== null ? ` — ${item.quantity} ${item.unit ?? ""}` : ""}${item.already_have ? " (already have)" : ""}`).join("\n");

  function printList() {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!doctype html><html><head><title>Plaivra grocery list</title><style>body{font-family:Arial;padding:24px;white-space:pre-line}</style></head><body><h1>Grocery list ${weekStart} to ${weekEnd}</h1>${textList.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</body></html>`);
    win.document.close();
    win.print();
  }

  async function shareList() {
    if (navigator.share) await navigator.share({ title: "Plaivra grocery list", text: textList });
    else {
      await navigator.clipboard.writeText(textList);
      toast({ title: "Grocery list copied" });
    }
  }

  function exportCsv() {
    const rows = [["item", "quantity", "unit", "section", "checked", "already_have", "notes"], ...items.map((item) => [item.item_name, item.quantity ?? "", item.unit ?? "", item.store_section, item.checked, item.already_have, item.notes ?? ""])];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `plaivra-grocery-${weekStart}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card variant="glass">
      <CardHeader className="p-4 sm:p-5">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2"><ShoppingCart className="h-5 w-5" /> Grocery list</span>
          <span className="text-xs font-normal text-muted-foreground">{items.filter((item) => item.checked).length}/{items.length} checked</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-4 pt-0 sm:p-5 sm:pt-0">
        <div className="space-y-2">
          <Label>Quick add</Label>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Input value={draft.itemName} onChange={(event) => setDraft((current) => ({ ...current, itemName: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") void addItem(); }} placeholder="Item name" />
            <Button onClick={addItem} disabled={!draft.itemName.trim()}><Plus className="h-4 w-4" /> Add</Button>
          </div>
        </div>
        <Disclosure title="Advanced details" description="Quantity, unit, store section, and notes">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2"><Label>Quantity</Label><Input type="number" value={draft.quantity} onChange={(event) => setDraft((current) => ({ ...current, quantity: event.target.value }))} /></div>
            <div className="space-y-2"><Label>Unit</Label><Input value={draft.unit} onChange={(event) => setDraft((current) => ({ ...current, unit: event.target.value }))} placeholder="kg" /></div>
            <div className="space-y-2"><Label>Section</Label><select value={draft.section} onChange={(event) => setDraft((current) => ({ ...current, section: event.target.value as GroceryStoreSection }))} className="h-11 w-full rounded-[14px] border bg-card px-3 text-sm">{sections.map((section) => <option key={section}>{section}</option>)}</select></div>
            <div className="space-y-2"><Label>Notes</Label><Input value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="Optional" /></div>
          </div>
        </Disclosure>
        <AiActionRequestDialog
          actions={[{ type: "build_grocery_list", label: "Build ingredient list with ChatGPT", description: "Ask ChatGPT to turn planned meals into an ingredient-level list grouped by store section." }]}
          sourceType="grocery_week"
          sourceId={weekStart}
          context={{ week_start: weekStart, week_end: weekEnd, grocery_items: items, meal_plan_items: mealItems }}
          title="Ask ChatGPT for help"
          buttonVariant="default"
          className="grid"
        />
        <div className="rounded-[14px] border border-border/70 bg-muted/20 p-3">
          <Button variant="outline" size="sm" className="w-full" onClick={importMeals} disabled={!mealItems.length}>Import meals as rough list</Button>
          <p className="mt-2 text-center text-xs leading-5 text-muted-foreground">This imports meal names as a rough list. For ingredient-level groceries, use ChatGPT to build the list.</p>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-border/60 pt-3">
          <Button variant="outline" size="sm" onClick={printList} disabled={!items.length}><Printer className="h-4 w-4" /> Print</Button>
          <Button variant="outline" size="sm" onClick={shareList} disabled={!items.length}><Share2 className="h-4 w-4" /> Share</Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!items.length}><Download className="h-4 w-4" /> Download list</Button>
          <AiActionRequestDialog
            actions={[{ type: "make_meal_cheaper", label: "Find cheaper options", description: "Ask ChatGPT for lower-cost substitutions for this grocery list." }]}
            sourceType="grocery_week"
            sourceId={weekStart}
            context={{ week_start: weekStart, week_end: weekEnd, grocery_items: items, meal_plan_items: mealItems }}
            title="Ask ChatGPT for help"
            buttonVariant="ghost"
          />
        </div>
        {isLoading ? <p className="text-sm text-muted-foreground">Loading grocery list...</p> : null}
        {!isLoading && !items.length ? <p className="text-sm text-muted-foreground">Your list is empty. Add an item, import meal names as a rough start, or ask ChatGPT to build an ingredient-level list.</p> : null}
        {grouped.map((group) => (
          <div key={group.section}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group.section}</p>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {group.items.map((item) => (
                <div key={item.id} className={cn("solid-row space-y-2 p-3", item.checked && "opacity-70")}>
                  <div className="flex items-start gap-3">
                    <input type="checkbox" checked={item.checked} onChange={() => patchItem(item, { checked: !item.checked })} className="mt-0.5 h-5 w-5 accent-primary" />
                    <div className="min-w-0 flex-1"><p className={cn("font-semibold", item.checked && "line-through")}>{item.item_name}</p><p className="text-xs text-muted-foreground">{item.quantity ?? "Qty not set"} {item.unit ?? ""}{item.notes ? ` · ${item.notes}` : ""}</p></div>
                    <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-destructive" onClick={() => remove(item)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={item.already_have} onChange={() => patchItem(item, { already_have: !item.already_have })} /> Already have at home</label>
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
