export function safeInternalRedirectPath(value: string | null | undefined, fallback = "/dashboard") {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;
  if (value.includes("\\") || /[\r\n\u0000]/.test(value)) return fallback;
  return value;
}
