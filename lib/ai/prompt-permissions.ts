import type { PromptCapability, PromptLanguage } from "@/lib/ai/quick-prompts";
import type { AiPermissionConfig, AiPermissionSettingsStatus } from "@/services/database/ai-permissions";
import type { AiPermissionSection } from "@/types";

export type PromptPermissionEvaluation =
  | { state: "loading" }
  | { state: "allowed" }
  | { state: "missing"; sections: AiPermissionSection[] }
  | { state: "failed"; message?: string }
  | { state: "signed-out" };

type PromptPermissionInput = {
  userId?: string | null;
  loading: boolean;
  status: AiPermissionSettingsStatus | null;
  config: AiPermissionConfig | null;
  sections: AiPermissionSection[];
  capability: PromptCapability;
};

function sectionAllowed(
  config: AiPermissionConfig,
  section: AiPermissionSection,
  capability: PromptCapability
) {
  if (config.accessMode === "full") return true;
  const saved = config.sections[section];
  return capability === "write" ? saved.write : saved.read || saved.write;
}

export function evaluatePromptPermission({
  userId,
  loading,
  status,
  config,
  sections,
  capability
}: PromptPermissionInput): PromptPermissionEvaluation {
  if (!userId) return { state: "signed-out" };
  if (loading || status === null) return { state: "loading" };
  if (status.state === "failed") return { state: "failed", message: status.message };

  if (sections.length === 0) return { state: "allowed" };

  if (status.state === "none" || !config) {
    return { state: "missing", sections: [...sections] };
  }

  const missing = sections.filter((section) => !sectionAllowed(config, section, capability));
  return missing.length ? { state: "missing", sections: missing } : { state: "allowed" };
}

const permissionCopy: Record<
  PromptLanguage,
  Record<PromptPermissionEvaluation["state"], string>
> = {
  en: {
    loading: "Checking access",
    allowed: "Available now",
    missing: "Requires access",
    failed: "Access could not be verified",
    "signed-out": "Sign in to check access"
  },
  de: {
    loading: "Zugriff wird geprüft",
    allowed: "Jetzt verfügbar",
    missing: "Zugriff erforderlich",
    failed: "Zugriff konnte nicht geprüft werden",
    "signed-out": "Zum Prüfen des Zugriffs anmelden"
  },
  ar: {
    loading: "جارٍ التحقق من الوصول",
    allowed: "متاح الآن",
    missing: "يتطلب الوصول",
    failed: "تعذر التحقق من الوصول",
    "signed-out": "سجّل الدخول للتحقق من الوصول"
  }
};

export function getPromptPermissionLabel(
  evaluation: PromptPermissionEvaluation,
  language: PromptLanguage
) {
  return permissionCopy[language][evaluation.state];
}
