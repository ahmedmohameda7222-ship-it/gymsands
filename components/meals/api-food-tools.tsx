"use client";

import { useEffect, useRef, useState } from "react";
import { Barcode, Camera, Save, Square } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/toaster";
import type { FoodLog, MealType } from "@/types";

type DetectedBarcode = { rawValue?: string };
type BarcodeDetectorInstance = { detect: (source: HTMLVideoElement) => Promise<DetectedBarcode[]> };
type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorInstance;
type BarcodeWindow = Window & { BarcodeDetector?: BarcodeDetectorConstructor };
type ScannerControls = { stop: () => void };


const mealTypes: MealType[] = ["Breakfast", "Lunch", "Snack", "Dinner"];

function macroLine(food: any) {
  return `${food.calories ?? "?"} kcal | P ${food.protein ?? "?"}g | C ${food.carbs ?? "?"}g | F ${food.fat ?? "?"}g`;
}

function waitForFrame(video: HTMLVideoElement) {
  if (video.readyState >= 2 && video.videoWidth > 0) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    const finish = () => {
      video.removeEventListener("loadedmetadata", finish);
      video.removeEventListener("canplay", finish);
      resolve(video.readyState >= 2 && video.videoWidth > 0);
    };
    video.addEventListener("loadedmetadata", finish, { once: true });
    video.addEventListener("canplay", finish, { once: true });
    window.setTimeout(finish, 1200);
  });
}

function nextAnimationFrame() {
  return new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
}

export function ApiFoodTools({
  selectedDate,
  onFoodLogged
}: {
  selectedDate?: string;
  onFoodLogged?: (log: FoodLog) => void;
}) {
  const { session } = useAuth();
  const { toast } = useToast();
  const [barcode, setBarcode] = useState("");
  const [barcodeFood, setBarcodeFood] = useState<any>(null);
  const [mealType, setMealType] = useState<MealType>("Breakfast");
  const [quantity, setQuantity] = useState("1");
  const [saveToLibrary, setSaveToLibrary] = useState(true);
  const [addToLog, setAddToLog] = useState(true);
  const [addToMealPlan, setAddToMealPlan] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scannerMessage, setScannerMessage] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const zxingControlsRef = useRef<ScannerControls | null>(null);
  const scanTimerRef = useRef<number | null>(null);


  function authHeaders(contentType = false) {
    return {
      Authorization: `Bearer ${session?.access_token ?? ""}`,
      ...(contentType ? { "Content-Type": "application/json" } : {})
    };
  }

  async function lookupBarcode(nextBarcode = barcode) {
    const cleanBarcode = nextBarcode.trim();
    if (!cleanBarcode) return toast({ title: "Barcode required", description: "Scan or enter a barcode first." });
    setBarcode(cleanBarcode);
    const response = await fetch(`/api/food/open-food-facts?barcode=${encodeURIComponent(cleanBarcode)}`, { headers: authHeaders() });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return toast({ title: "Barcode lookup failed", description: data.error ?? "Try another barcode." });
    setBarcode(cleanBarcode);
    setBarcodeFood(data.food);
    toast({ title: "Barcode found", description: data.food?.name ?? cleanBarcode });
  }

  function stopScanner() {
    if (scanTimerRef.current) window.clearInterval(scanTimerRef.current);
    scanTimerRef.current = null;
    zxingControlsRef.current?.stop();
    zxingControlsRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsScanning(false);
  }

  async function openCameraStream(preferEnvironmentCamera: boolean) {
    return navigator.mediaDevices.getUserMedia({
      video: preferEnvironmentCamera
        ? { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }
        : true,
      audio: false
    });
  }

  async function attachCameraStream(stream: MediaStream) {
    const video = videoRef.current;
    if (!video) throw new Error("Camera preview is not ready. Please tap Scan again.");
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await video.play();
    return waitForFrame(video);
  }

  function handleDetectedBarcode(value: string) {
    const cleanBarcode = value.trim();
    if (!cleanBarcode) return;
    setBarcode(cleanBarcode);
    setScannerMessage(`Barcode detected: ${cleanBarcode}`);
    stopScanner();
    lookupBarcode(cleanBarcode).catch(() => undefined);
  }

  async function startNativeBarcodeDetector() {
    const video = videoRef.current;
    if (!video) throw new Error("Camera preview is not ready. Please tap Scan again.");

    let stream = await openCameraStream(true);
    streamRef.current = stream;
    let hasFrame = await attachCameraStream(stream);

    if (!hasFrame) {
      stream.getTracks().forEach((track) => track.stop());
      stream = await openCameraStream(false);
      streamRef.current = stream;
      hasFrame = await attachCameraStream(stream);
    }

    if (!hasFrame) throw new Error("The camera opened but did not send video frames. Try another browser or type the barcode manually.");

    const Detector = (window as BarcodeWindow).BarcodeDetector;
    if (!Detector) return false;

    const detector = new Detector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"] });
    setScannerMessage("Camera ready. Point it at the barcode.");
    scanTimerRef.current = window.setInterval(async () => {
      if (!videoRef.current || videoRef.current.readyState < 2 || videoRef.current.videoWidth === 0) return;
      const codes = await detector.detect(videoRef.current).catch(() => []);
      const value = codes[0]?.rawValue?.trim();
      if (!value) return;
      handleDetectedBarcode(value);
    }, 450);
    return true;
  }

  async function startZxingScanner() {
    const video = videoRef.current;
    if (!video) throw new Error("Camera preview is not ready. Please tap Scan again.");

    const { BrowserMultiFormatReader } = await import("@zxing/browser");
    const reader = new BrowserMultiFormatReader();
    setScannerMessage("Camera ready. Point it at the barcode.");
    zxingControlsRef.current = await reader.decodeFromVideoDevice(undefined, video, (result) => {
      const value = result?.getText()?.trim();
      if (!value) return;
      handleDetectedBarcode(value);
    });
  }

  async function startScanner() {
    if (!navigator.mediaDevices?.getUserMedia) {
      return toast({ title: "Camera unavailable", description: "This browser cannot open the camera. Type the barcode manually." });
    }

    try {
      stopScanner();
      setBarcodeFood(null);
      setIsScanning(true);
      setScannerMessage("Opening camera...");
      await nextAnimationFrame();

      const startedNative = await startNativeBarcodeDetector();
      if (!startedNative) {
        stopScanner();
        setIsScanning(true);
        await nextAnimationFrame();
        await startZxingScanner();
      }
    } catch (error) {
      stopScanner();
      toast({ title: "Camera permission failed", description: error instanceof Error ? error.message : "Allow camera access and try again." });
    }
  }

  async function saveBarcodeFood() {
    if (!barcodeFood) return toast({ title: "Lookup a barcode first", description: "Find the packaged food before saving it." });
    if (!saveToLibrary && !addToLog && !addToMealPlan) {
      return toast({ title: "Choose an action", description: "Save to foods, add to daily log, or add to meal plan." });
    }

    const response = await fetch("/api/food/open-food-facts", {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({
        barcode,
        quantity: Number(quantity),
        mealType,
        date: selectedDate,
        saveToLibrary,
        addToLog,
        addToMealPlan
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return toast({ title: "Could not save food", description: data.error ?? "Please try again." });
    if (data.log) onFoodLogged?.(data.log as FoodLog);
    toast({
      title: "Food saved",
      description: addToLog ? `${data.food?.name ?? barcodeFood.name} added to ${mealType}.` : data.libraryFood?.food_name ?? data.food?.name ?? barcodeFood.name
    });
  }



  useEffect(() => {

    return stopScanner;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token]);

  return (
    <Card className="solid-tracking-card">
      <CardHeader>
        <CardTitle>Barcode meals</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="solid-row p-3">
          <p className="mb-2 flex items-center gap-2 font-semibold"><Barcode className="h-4 w-4 text-primary" /> Barcode lookup</p>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <Input value={barcode} onChange={(event) => setBarcode(event.target.value)} placeholder="Barcode" />
            <Button type="button" variant="outline" onClick={isScanning ? stopScanner : startScanner}>
              {isScanning ? <Square className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
              {isScanning ? "Stop" : "Scan"}
            </Button>
            <Button type="button" onClick={() => lookupBarcode()}>Lookup</Button>
          </div>
          <div className={`mt-3 overflow-hidden rounded-md border bg-black ${isScanning ? "" : "hidden"}`}>
            <video ref={videoRef} className="aspect-video w-full object-cover" muted playsInline autoPlay />
          </div>
          {scannerMessage ? <p className="mt-2 text-sm text-muted-foreground">{scannerMessage}</p> : null}
          {barcodeFood ? (
            <div className="solid-row mt-3 p-3 text-sm">
              <p className="font-semibold">{barcodeFood.name}</p>
              <p className="text-muted-foreground">{barcodeFood.brand ?? "Unknown brand"} | {macroLine(barcodeFood)}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <Input type="number" min="0.1" step="0.1" inputMode="decimal" enterKeyHint="done" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="Qty" />
                <Select value={mealType} onValueChange={(value) => setMealType(value as MealType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {mealTypes.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button type="button" onClick={saveBarcodeFood}>
                  <Save className="h-4 w-4" />
                  Save
                </Button>
              </div>
              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                <label className="flex items-center gap-2"><input type="checkbox" checked={saveToLibrary} onChange={(event) => setSaveToLibrary(event.target.checked)} /> My foods</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={addToLog} onChange={(event) => setAddToLog(event.target.checked)} /> Daily log</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={addToMealPlan} onChange={(event) => setAddToMealPlan(event.target.checked)} /> Meal plan</label>
              </div>
            </div>
          ) : null}
        </div>

      </CardContent>
    </Card>
  );
}
