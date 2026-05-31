export function workoutStorageKey(parts: Array<string | null | undefined>) {
  return ["ss-gym", ...parts.map((part) => part || "unknown")].join(":");
}

export function readStoredTimestamp(key: string) {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(key);
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function storeTimestamp(key: string, timestampMs: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, new Date(timestampMs).toISOString());
}

export function clearStoredValue(key: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(key);
}

export function readStoredJson<T>(key: string) {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(key);
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    window.localStorage.removeItem(key);
    return null;
  }
}

export function storeJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}
