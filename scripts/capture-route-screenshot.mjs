import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const pairs = [];
for (let index = 2; index < process.argv.length; index += 2) pairs.push([process.argv[index].replace(/^--/, ""), process.argv[index + 1]]);
const options = Object.fromEntries(pairs);
const url = new URL(options.url);
const output = resolve(options.output);
const width = Number(options.width);
const height = Number(options.height);
const deviceScaleFactor = Number(options["device-scale-factor"] || 1);
const port = Number(options.port || 9222);
if (!Number.isInteger(width) || !Number.isInteger(height) || width < 320 || height < 400) throw new Error("Valid --width and --height are required.");
if (!Number.isFinite(deviceScaleFactor) || deviceScaleFactor < 1 || deviceScaleFactor > 3) throw new Error("Device scale factor must be between 1 and 3.");

const targetResponse = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url.toString())}`, { method: "PUT" });
if (!targetResponse.ok) throw new Error(`Chrome target creation failed with HTTP ${targetResponse.status}.`);
const target = await targetResponse.json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolveOpen, rejectOpen) => {
  socket.addEventListener("open", resolveOpen, { once: true });
  socket.addEventListener("error", rejectOpen, { once: true });
});

let commandId = 0;
const pending = new Map();
socket.addEventListener("message", (message) => {
  const response = JSON.parse(String(message.data));
  if (!response.id || !pending.has(response.id)) return;
  const { resolve: resolveCommand, reject: rejectCommand } = pending.get(response.id);
  pending.delete(response.id);
  if (response.error) rejectCommand(new Error(response.error.message));
  else resolveCommand(response.result);
});

function send(method, params = {}) {
  commandId += 1;
  const id = commandId;
  return new Promise((resolveCommand, rejectCommand) => {
    pending.set(id, { resolve: resolveCommand, reject: rejectCommand });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor, mobile: options.mobile === "true", screenWidth: width, screenHeight: height });
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
await send("Page.navigate", { url: url.toString() });
await send("Runtime.evaluate", {
  expression: "new Promise(resolve => { const done = () => setTimeout(resolve, 750); if (document.readyState === 'complete') document.fonts.ready.then(done); else addEventListener('load', () => document.fonts.ready.then(done), { once: true }); })",
  awaitPromise: true,
  returnByValue: true
});
if (options["scroll-y"]) {
  const scrollY = Math.max(0, Number(options["scroll-y"]) || 0);
  await send("Runtime.evaluate", {
    expression: `new Promise(resolve => { window.scrollTo(0, ${scrollY}); setTimeout(resolve, 300); })`,
    awaitPromise: true,
    returnByValue: true
  });
}
if (options["offline-after-load"] === "true") {
  await send("Network.enable");
  await send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await send("Runtime.evaluate", { expression: "new Promise(resolve => setTimeout(resolve, 500))", awaitPromise: true, returnByValue: true });
}
const screenshot = await send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, Buffer.from(screenshot.data, "base64"));
socket.close();
process.stdout.write(`${output}\n`);
