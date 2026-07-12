"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Loader2, Search, Square } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InlineFeedback } from "@/components/motion";
import { barcodeValidationMessage, normalizeProductBarcode } from "@/lib/barcodes";
import { useEatTranslation } from "@/lib/i18n/eat";
import type { FoodLog, MealType } from "@/types";

type BarcodeFood = {
  name: string;
  brand?: string | null;
  servingSize?: string | null;
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
};

type BarcodeDetectorResult = { rawValue?: string };
type BarcodeDetectorInstance = { detect: (source: HTMLVideoElement) => Promise<BarcodeDetectorResult[]> };
type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorInstance;
type BarcodeWindow = Window & { BarcodeDetector?: BarcodeDetectorConstructor };

type ScannerControls = { stop: () => void };

export function EatBarcodeMethod({
  date,
  mealType,
  onLogged
}: {
  date: string;
  mealType: MealType;
  onLogged: (log: FoodLog) => void;
}) {
  const { session } = useAuth();
  const { et, formatDate, mealLabel } = useEatTranslation();
  const [barcode, setBarcode] = useState("");
  const [food, setFood] = useState<BarcodeFood | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [isScanning, setIsScanning] = useState(false);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "info" | "error"; message: string } | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const controlsRef = useRef<ScannerControls | null>(null);
  const timerRef = useRef<number | null>(null);

  const stopScanner = useCallback(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    controlsRef.current?.stop();
    controlsRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsScanning(false);
  }, []);

  useEffect(() => stopScanner, [stopScanner]);

  function headers(contentType = false) {
    return {
      Authorization: `Bearer ${session?.access_token ?? ""}`,
      ...(contentType ? { "Content-Type": "application/json" } : {})
    };
  }

  async function lookup(next = barcode) {
    const clean = normalizeProductBarcode(next);
    if (!clean) {
      setFeedback({ type: "error", message: barcodeValidationMessage(next) });
      return;
    }
    setBarcode(clean);
    setIsLookingUp(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/food/open-food-facts?barcode=${encodeURIComponent(clean)}`, { headers: headers() });
      const data = await response.json().catch(() => ({})) as { food?: BarcodeFood; error?: string };
      if (!response.ok || !data.food) throw new Error(data.error ?? "Product could not be loaded.");
      setFood(data.food);
      setFeedback({ type: "info", message: `${data.food.name} · ${formatDate(date)} · ${mealLabel(mealType)}` });
    } catch (error) {
      setFood(null);
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Barcode lookup failed." });
    } finally {
      setIsLookingUp(false);
    }
  }

  async function handleDetected(raw: string) {
    const clean = normalizeProductBarcode(raw);
    if (!clean) return;
    setBarcode(clean);
    stopScanner();
    await lookup(clean);
  }

  async function startScanner() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setFeedback({ type: "error", message: et("cameraUnavailable") });
      return;
    }
    stopScanner();
    setFeedback({ type: "info", message: "Opening camera…" });
    setIsScanning(true);
    try {
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      const video = videoRef.current;
      if (!video) throw new Error(et("cameraUnavailable"));
      const Detector = (window as BarcodeWindow).BarcodeDetector;
      if (Detector) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        streamRef.current = stream;
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        await video.play();
        const detector = new Detector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"] });
        timerRef.current = window.setInterval(async () => {
          const results = await detector.detect(video).catch(() => []);
          const value = results[0]?.rawValue?.trim();
          if (value) void handleDetected(value);
        }, 500);
      } else {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        controlsRef.current = await reader.decodeFromVideoDevice(undefined, video, (result) => {
          const value = result?.getText()?.trim();
          if (value) void handleDetected(value);
        });
      }
      setFeedback({ type: "info", message: "Camera ready." });
    } catch (error) {
      stopScanner();
      setFeedback({ type: "error", message: error instanceof Error ? error.message : et("cameraUnavailable") });
    }
  }

  async function save() {
    const parsedQuantity = Number(quantity);
    if (!food || !Number.isFinite(parsedQuantity) || parsedQuantity <= 0 || isSaving) {
      setFeedback({ type: "error", message: "Review the product and quantity before logging." });
      return;
    }
    setIsSaving(true);
    setFeedback({ type: "info", message: et("logging") });
    try {
      const response = await fetch("/api/food/open-food-facts", {
        method: "POST",
        headers: headers(true),
        body: JSON.stringify({ barcode, quantity: parsedQuantity, mealType, date, saveToLibrary: false, addToLog: true, addToMealPlan: false })
      });
      const data = await response.json().catch(() => ({})) as { log?: FoodLog; error?: string };
      if (!response.ok || !data.log) throw new Error(data.error ?? "Product could not be logged.");
      onLogged(data.log);
      setFeedback({ type: "info", message: et("logged") });
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : et("saveFailed") });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <Input value={barcode} inputMode="numeric" onChange={(event) => { setBarcode(event.target.value.replace(/\D/g, "")); setFood(null); }} placeholder="EAN / UPC / GTIN" aria-label={et("barcode")} />
        <Button type="button" variant="outline" className="min-h-12" onClick={isScanning ? stopScanner : startScanner}>{isScanning ? <Square className="h-4 w-4" /> : <Camera className="h-4 w-4" />}{isScanning ? et("stop") : et("scan")}</Button>
        <Button type="button" className="min-h-12" onClick={() => void lookup()} disabled={isLookingUp}>{isLookingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}{et("lookup")}</Button>
      </div>
      <div className={isScanning ? "overflow-hidden rounded-[14px] border bg-black" : "hidden"}><video ref={videoRef} className="aspect-video w-full object-cover" muted playsInline autoPlay /></div>
      {food ? <div className="rounded-[14px] border border-border/70 p-3">
        <p className="font-semibold">{food.name}</p>
        <p className="mt-1 text-sm text-muted-foreground">{food.brand ?? ""}</p>
        <p className="mt-2 text-sm">{food.calories ?? "—"} kcal · P {food.protein ?? "—"} g · C {food.carbs ?? "—"} g · F {food.fat ?? "—"} g</p>
        <p className="mt-1 text-xs text-muted-foreground">{food.servingSize ?? et("storedServingOnly")}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-[140px_1fr]"><Input type="number" min="0.1" step="0.1" value={quantity} onChange={(event) => setQuantity(event.target.value)} aria-label={et("quantity")} /><Button type="button" className="min-h-12" onClick={save} disabled={isSaving}>{isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{et("logFood")}</Button></div>
      </div> : null}
      <InlineFeedback message={feedback?.message} variant={feedback?.type === "error" ? "error" : "info"} onClose={() => setFeedback(null)} />
    </div>
  );
}
