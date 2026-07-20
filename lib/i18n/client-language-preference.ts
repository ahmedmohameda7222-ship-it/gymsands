import { isLanguagePreference, type LanguagePreference } from "@/lib/i18n/config";

export const languagePreferenceStorageKey = "plaivra.language.v1";
export const languagePreferenceMaxAgeSeconds = 31_536_000;

type StorageLike = Pick<Storage, "getItem" | "setItem">;
type CookieDocumentLike = Pick<Document, "cookie">;

export function parseLanguagePreference(value: unknown): LanguagePreference | null {
  return isLanguagePreference(value) ? value : null;
}

export function serializeLanguagePreference(value: unknown): LanguagePreference | null {
  return parseLanguagePreference(value);
}

export function readStoredLanguagePreference(storage?: StorageLike | null): LanguagePreference | null {
  const target = storage ?? (typeof window !== "undefined" ? window.localStorage : null);
  if (!target) return null;
  try {
    return parseLanguagePreference(target.getItem(languagePreferenceStorageKey));
  } catch {
    return null;
  }
}

export function writeStoredLanguagePreference(
  preference: LanguagePreference,
  storage?: StorageLike | null
): boolean {
  const target = storage ?? (typeof window !== "undefined" ? window.localStorage : null);
  if (!target) return false;
  try {
    target.setItem(languagePreferenceStorageKey, preference);
    return true;
  } catch {
    return false;
  }
}

export function readLanguagePreferenceCookie(cookieHeader: string | null | undefined): LanguagePreference | null {
  if (!cookieHeader) return null;
  for (const entry of cookieHeader.split(";")) {
    const separator = entry.indexOf("=");
    if (separator < 0) continue;
    const name = entry.slice(0, separator).trim();
    if (name !== languagePreferenceStorageKey) continue;
    try {
      return parseLanguagePreference(decodeURIComponent(entry.slice(separator + 1).trim()));
    } catch {
      return null;
    }
  }
  return null;
}

export function buildLanguagePreferenceCookie(
  preference: LanguagePreference,
  options: { secure?: boolean } = {}
): string {
  const attributes = [
    languagePreferenceStorageKey + "=" + encodeURIComponent(preference),
    "Path=/",
    "SameSite=Lax",
    "Max-Age=" + languagePreferenceMaxAgeSeconds
  ];
  if (options.secure) attributes.push("Secure");
  return attributes.join("; ");
}

export function writeLanguagePreferenceCookie(
  preference: LanguagePreference,
  documentLike?: CookieDocumentLike | null,
  secure?: boolean
): boolean {
  const target = documentLike ?? (typeof document !== "undefined" ? document : null);
  if (!target) return false;
  try {
    const useSecure = secure ?? (typeof window !== "undefined" && window.location.protocol === "https:");
    target.cookie = buildLanguagePreferenceCookie(preference, { secure: useSecure });
    return true;
  } catch {
    return false;
  }
}

export function synchronizeClientLanguagePreference(preference: LanguagePreference): void {
  writeStoredLanguagePreference(preference);
  writeLanguagePreferenceCookie(preference);
}
