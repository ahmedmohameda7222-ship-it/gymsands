"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, FileDown, MoreHorizontal, Plus, RefreshCw, Share2, ShoppingCart, Trash2, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { AiActionRequestDialog } from "@/components/ai/ai-action-request-dialog";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Disclosure } from "@/components/ui/disclosure";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toaster";
import { useTranslation } from "@/lib/i18n/use-translation";
import { cn } from "@/lib/utils";
import { InlineFeedback } from "@/components/motion";
import { userSafeError } from "@/lib/error-formatting";
import { deleteGroceryItem, getGroceryItems, upsertGroceryItem } from "@/services/database/execution-layer";
import type { GroceryStoreSection, MealPlanItem, UserGroceryItem } from "@/types";
import type { PDFFont } from "pdf-lib";

const sections: GroceryStoreSection[] = ["Protein", "Carbs", "Vegetables", "Fruits", "Dairy", "Pantry", "Frozen", "Drinks", "Other"];
const commonUnits = ["g", "kg", "ml", "L", "pcs", "slices", "cups", "tbsp", "tsp", "pack", "can", "bottle", "bunch", "item"];

const shoppingCopy = {
  en: {
    emptyTitle: "Your grocery list is empty.",
    emptyDescription: "Ask ChatGPT to build an ingredient-level list from your meal plan.",
    buildLabel: "Build ingredient list with ChatGPT",
    buildDescription: "Ask ChatGPT to turn planned meals into an ingredient-level list grouped by store section.",
    cheaperLabel: "Find cheaper options",
    cheaperDescription: "Ask ChatGPT for lower-cost substitutions for this grocery list.",
    askTitle: "Ask ChatGPT for help"
  },
  de: {
    emptyTitle: "Deine Einkaufsliste ist leer.",
    emptyDescription: "Bitte ChatGPT, aus deinem Essensplan eine Zutatenliste zu erstellen.",
    buildLabel: "Zutatenliste mit ChatGPT erstellen",
    buildDescription: "ChatGPT erstellt aus den geplanten Mahlzeiten eine nach Ladenbereichen gruppierte Zutatenliste.",
    cheaperLabel: "Günstigere Optionen finden",
    cheaperDescription: "Bitte ChatGPT um günstigere Alternativen für diese Einkaufsliste.",
    askTitle: "ChatGPT um Hilfe bitten"
  },
  ar: {
    emptyTitle: "قائمة المشتريات فارغة.",
    emptyDescription: "اطلب من ChatGPT إنشاء قائمة مكونات من خطة الوجبات.",
    buildLabel: "إنشاء قائمة المكونات باستخدام ChatGPT",
    buildDescription: "اطلب من ChatGPT تحويل الوجبات المخططة إلى قائمة مكونات مرتبة حسب أقسام المتجر.",
    cheaperLabel: "العثور على بدائل أقل تكلفة",
    cheaperDescription: "اطلب من ChatGPT اقتراح بدائل أقل تكلفة لقائمة المشتريات.",
    askTitle: "طلب المساعدة من ChatGPT"
  }
} as const;

export function GroceryListPanel({ weekStart, weekEnd, mealItems, refreshKey, onStats }: {
  weekStart: string;
  weekEnd: string;
  mealItems: MealPlanItem[];
  refreshKey: number;
  onStats: (count: number, checked: number) => void;
}) {
  const { user } = useAuth();
  const userId = user?.id;
  const { language } = useTranslation();
  const copy = shoppingCopy[language];
  const { toast } = useToast();
  const { dialog: confirmDialog, ask: confirmAsk } = useConfirm();
  const [items, setItems] = useState<UserGroceryItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [menuOpen, setMenuOpen] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
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

  useEffect(() => {
    onStats(items.length, items.filter((item) => item.checked).length);
  }, [items, onStats]);

  const grouped = useMemo(() => sections
    .map((section) => ({ section, items: items.filter((item) => item.store_section === section) }))
    .filter((group) => group.items.length), [items]);
  const importedItems = useMemo(() => items.filter((item) => item.created_by !== "manual"), [items]);
  const selectedItems = useMemo(() => items.filter((item) => selectedIds.has(item.id)), [items, selectedIds]);

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
      setShowQuickAdd(false);
      setFeedback(`${saved.item_name} was added to this grocery list.`);
    } catch (error) {
      toast({ title: "Could not add grocery item", description: userSafeError(error) });
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

  async function downloadPdf() {
    if (!items.length) return;
    setIsBusy(true);
    try {
      const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
      const pdf = await PDFDocument.create();
      const regular = await pdf.embedFont(StandardFonts.Helvetica);
      const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
      const logoBytes = await fetch("/plaivra-logo.png").then((response) => response.arrayBuffer());
      const logo = await pdf.embedPng(logoBytes);
      const primary = rgb(0.176, 0.227, 0.118);
      const gold = rgb(0.77, 0.60, 0.23);
      const muted = rgb(0.38, 0.38, 0.38);
      const border = rgb(0.88, 0.87, 0.83);
      const pageSize: [number, number] = [595.28, 841.89];
      let page = pdf.addPage(pageSize);
      let y = page.getHeight() - 52;

      function wrap(value: string, font: PDFFont, size: number, maxWidth: number) {
        const lines: string[] = [];
        let current = "";
        value.split(/\s+/).forEach((word) => {
          const candidate = current ? `${current} ${word}` : word;
          if (font.widthOfTextAtSize(candidate, size) <= maxWidth) current = candidate;
          else {
            if (current) lines.push(current);
            current = word;
          }
        });
        if (current) lines.push(current);
        return lines;
      }

      function drawHeader() {
        page.drawImage(logo, { x: 42, y: page.getHeight() - 83, width: 34, height: 34 });
        page.drawText("PLAIVRA", { x: 90, y: page.getHeight() - 59, size: 11, font: bold, color: gold });
        page.drawText("Grocery List", { x: 90, y: page.getHeight() - 79, size: 22, font: bold, color: primary });
        page.drawText(`${weekStart} to ${weekEnd}`, { x: 42, y: page.getHeight() - 108, size: 10, font: regular, color: muted });
        page.drawLine({ start: { x: 42, y: page.getHeight() - 122 }, end: { x: page.getWidth() - 42, y: page.getHeight() - 122 }, thickness: 1, color: border });
        y = page.getHeight() - 150;
      }

      function ensureSpace(height: number) {
        if (y - height > 48) return;
        page = pdf.addPage(pageSize);
        drawHeader();
      }

      drawHeader();
      grouped.forEach((group) => {
        ensureSpace(38);
        page.drawText(group.section.toUpperCase(), { x: 42, y, size: 10, font: bold, color: gold });
        y -= 19;
        group.items.forEach((item) => {
          const quantity = item.quantity !== null ? `${item.quantity} ${item.unit ?? ""}`.trim() : "";
          const status = item.already_have ? "Already have" : item.checked ? "Checked" : "";
          const detail = [quantity, status, item.notes ?? ""].filter(Boolean).join(" - ");
          const nameLines = wrap(item.item_name, bold, 11, 360);
          const detailLines = detail ? wrap(detail, regular, 9, 400) : [];
          const rowHeight = Math.max(30, nameLines.length * 14 + detailLines.length * 12 + 8);
          ensureSpace(rowHeight);
          page.drawRectangle({ x: 44, y: y - 10, width: 10, height: 10, borderWidth: 1, borderColor: primary, color: item.checked || item.already_have ? primary : undefined });
          nameLines.forEach((line, index) => page.drawText(line, { x: 65, y: y - index * 14, size: 11, font: bold, color: primary }));
          detailLines.forEach((line, index) => page.drawText(line, { x: 65, y: y - nameLines.length * 14 - index * 12 + 2, size: 9, font: regular, color: muted }));
          y -= rowHeight;
          page.drawLine({ start: { x: 65, y: y + 8 }, end: { x: page.getWidth() - 42, y: y + 8 }, thickness: 0.5, color: border });
        });
        y -= 8;
      });

      pdf.getPages().forEach((pdfPage, index, pages) => {
        pdfPage.drawText("Plaivra - Plan. Execute. Track.", { x: 42, y: 25, size: 8, font: regular, color: muted });
        pdfPage.drawText(`${index + 1} / ${pages.length}`, { x: pdfPage.getWidth() - 70, y: 25, size: 8, font: regular, color: muted });
      });
      const bytes = await pdf.save();
      const pdfBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const url = URL.createObjectURL(new Blob([pdfBuffer], { type: "application/pdf" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `plaivra-groceries-${weekStart}.pdf`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setFeedback("Plaivra grocery PDF downloaded.");
      toast({ title: "Grocery PDF downloaded", description: anchor.download });
    } catch (error) {
      toast({ title: "Could not create grocery PDF", description: userSafeError(error), variant: "error" });
    } finally {
      setIsBusy(false);
    }
  }

  const buildAction = (
    <AiActionRequestDialog
      actions={[{ type: "build_grocery_list", label: copy.buildLabel, description: copy.buildDescription }]}
      sourceType="grocery_week"
      sourceId={weekStart}
      context={{ week_start: weekStart, week_end: weekEnd, grocery_items: items, meal_plan_items: mealItems }}
      title={copy.askTitle}
      buttonVariant="default"
      className="grid w-full sm:w-auto [&_button]:min-h-11 [&_button]:w-full sm:[&_button]:w-auto"
    />
  );

  return (
    <Card variant="glass">
      {confirmDialog}
      <CardHeader className="p-4 sm:p-5">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2"><ShoppingCart className="h-5 w-5" /> Grocery list</span>
          <span className="flex items-center gap-2">
            <span className="text-xs font-normal text-muted-foreground">{items.filter((item) => item.checked).length}/{items.length} checked{selectedIds.size ? ` · ${selectedIds.size} selected` : ""}</span>
            <span className="relative">
              <Button type="button" variant="ghost" size="icon" aria-label="Grocery actions" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}><MoreHorizontal className="h-5 w-5" /></Button>
              {menuOpen ? (
                <span className="absolute end-0 top-12 z-50 grid w-56 gap-1 rounded-[16px] border border-border/80 bg-card p-2 text-sm shadow-xl">
                  <button type="button" className="rounded-xl px-3 py-2 text-start hover:bg-muted" onClick={() => { setShowQuickAdd(true); setMenuOpen(false); }}>Quick add</button>
                  <button type="button" className="rounded-xl px-3 py-2 text-start hover:bg-muted disabled:opacity-40" disabled={!items.length} onClick={() => { setSelectedIds(new Set(items.map((item) => item.id))); setMenuOpen(false); }}>Select all</button>
                  <button type="button" className="rounded-xl px-3 py-2 text-start hover:bg-muted disabled:opacity-40" disabled={!importedItems.length} onClick={() => { setSelectedIds(new Set(importedItems.map((item) => item.id))); setMenuOpen(false); }}>Select imported</button>
                  <button type="button" className="rounded-xl px-3 py-2 text-start hover:bg-muted disabled:opacity-40" disabled={!selectedIds.size} onClick={() => { setSelectedIds(new Set()); setMenuOpen(false); }}>Clear selection</button>
                  <button type="button" className="rounded-xl px-3 py-2 text-start hover:bg-muted disabled:opacity-40" disabled={!selectedIds.size || isBusy} onClick={() => { void patchSelected({ already_have: true }, `${selectedItems.length} item${selectedItems.length === 1 ? "" : "s"} marked as already at home.`); setMenuOpen(false); }}>Mark already have</button>
                  <span className="my-1 h-px bg-border" />
                  <button type="button" className="rounded-xl px-3 py-2 text-start text-destructive hover:bg-destructive/10 disabled:opacity-40" disabled={!selectedIds.size || isBusy} onClick={() => { confirmDelete(selectedItems, "Delete selected items?", "Selected items deleted."); setMenuOpen(false); }}>Delete selected</button>
                  <button type="button" className="rounded-xl px-3 py-2 text-start text-destructive hover:bg-destructive/10 disabled:opacity-40" disabled={!items.some((item) => item.checked) || isBusy} onClick={() => { confirmDelete(items.filter((item) => item.checked), "Clear checked items?", "Checked items cleared."); setMenuOpen(false); }}>Clear checked</button>
                  <button type="button" className="rounded-xl px-3 py-2 text-start text-destructive hover:bg-destructive/10 disabled:opacity-40" disabled={!items.length || isBusy} onClick={() => { confirmDelete(items, "Clear the entire list?", "Grocery list cleared."); setMenuOpen(false); }}>Clear list</button>
                </span>
              ) : null}
            </span>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-4 pt-0 sm:p-5 sm:pt-0">
        <InlineFeedback message={feedback} onClose={() => setFeedback("")} />

        {showQuickAdd ? <>
          <div className="space-y-2 rounded-[14px] border border-border/70 bg-muted/20 p-3">
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
        </> : null}

        {isLoading ? <p className="text-sm text-muted-foreground">Loading grocery list...</p> : null}
        {!isLoading && loadError ? (
          <div className="rounded-[14px] border border-destructive/30 bg-destructive/5 p-4" role="alert">
            <p className="font-semibold text-foreground">Grocery list could not load</p>
            <p className="mt-1 text-sm text-muted-foreground">{loadError}</p>
            <Button className="mt-3" size="sm" onClick={() => setLoadNonce((current) => current + 1)}><RefreshCw className="h-4 w-4" /> Try again</Button>
          </div>
        ) : null}

        {!isLoading && !loadError && !items.length ? (
          <div className="rounded-[14px] border border-dashed px-4 py-5 text-center sm:text-start">
            <p className="font-semibold text-foreground">{copy.emptyTitle}</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{copy.emptyDescription}</p>
            <div className="mt-3 flex justify-center sm:justify-start">{buildAction}</div>
          </div>
        ) : null}

        {!isLoading && !loadError && items.length ? (
          <div className="flex flex-col gap-3 border-t border-border/60 pt-3 sm:flex-row sm:items-center sm:justify-between">
            {buildAction}
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => void downloadPdf()} disabled={isBusy}><FileDown className="h-4 w-4" /> Download PDF</Button>
              <Button variant="outline" size="sm" onClick={() => void shareList()}><Share2 className="h-4 w-4" /> Share</Button>
              <AiActionRequestDialog
                actions={[{ type: "make_meal_cheaper", label: copy.cheaperLabel, description: copy.cheaperDescription }]}
                sourceType="grocery_week"
                sourceId={weekStart}
                context={{ week_start: weekStart, week_end: weekEnd, grocery_items: items, meal_plan_items: mealItems }}
                title={copy.askTitle}
                buttonVariant="outline"
                className="grid [&_button]:min-h-9"
              />
            </div>
          </div>
        ) : null}

        <AnimatePresence>
          {selectedIds.size > 0 ? (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
              className="flex flex-wrap items-center gap-2 rounded-[12px] border border-primary/25 bg-primary/5 p-2.5"
            >
              <span className="text-sm font-semibold">{selectedIds.size} selected</span>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => setSelectedIds(new Set(items.map((item) => item.id)))}>Select all</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setSelectedIds(new Set())}><X className="h-4 w-4" /> Clear</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => void patchSelected({ checked: true }, `${selectedItems.length} item${selectedItems.length === 1 ? "" : "s"} marked checked.`)} disabled={isBusy}><Check className="h-4 w-4" /> Mark checked</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => void patchSelected({ already_have: true }, `${selectedItems.length} item${selectedItems.length === 1 ? "" : "s"} marked as already have.`)} disabled={isBusy}>Already have</Button>
                <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => confirmDelete(selectedItems, "Delete selected items?", "Selected items deleted.")} disabled={isBusy}><Trash2 className="h-4 w-4" /> Delete</Button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {grouped.map((group) => (
          <div key={group.section}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group.section} · {group.items.filter((item) => item.checked).length}/{group.items.length} checked</p>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {group.items.map((item) => (
                <motion.div
                  layout
                  key={item.id}
                  initial={{ opacity: 0, y: 2 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15 }}
                  className={cn(
                    "solid-row space-y-3 p-3 transition-all duration-200",
                    item.checked && "bg-success/5 opacity-75",
                    selectedIds.has(item.id) && "border-2 border-primary bg-primary/5"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => toggleSelection(item.id)} aria-label={`Select ${item.item_name}`} className="mt-0.5 h-6 w-6 shrink-0 accent-primary" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><p className={cn("font-semibold transition-all duration-200", item.checked && "text-muted-foreground line-through")}>{item.item_name}</p>{item.created_by === "meal_plan" ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">Imported</span> : null}</div>
                      <p className="text-xs text-muted-foreground">{item.quantity ?? "Qty not set"} {item.unit ?? ""}{item.notes ? ` · ${item.notes}` : ""}</p>
                    </div>
                    <Button type="button" variant="ghost" size="icon" className="shrink-0 text-destructive" onClick={() => confirmDelete([item], `Delete ${item.item_name}?`, `${item.item_name} deleted.`)} aria-label={`Delete ${item.item_name}`}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-primary" checked={item.checked} onChange={() => void patchItem(item, { checked: !item.checked })} /> Checked off</label>
                    <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-primary" checked={item.already_have} onChange={() => void patchItem(item, { already_have: !item.already_have })} /> Already have</label>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
