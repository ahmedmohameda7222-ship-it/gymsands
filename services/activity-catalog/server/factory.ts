import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { ActivityCatalogError } from "@/lib/activity-catalog/errors";
import type { ActivityCatalogProviderMode } from "@/lib/activity-catalog/types";
import { CompositeActivityCatalogProvider } from "./composite-provider";
import { HttpActivityCatalogProvider, type HttpActivityCatalogProviderOptions } from "./http-provider";
import { LegacyActivityCatalogProvider } from "./legacy-provider";
import type { ActivityCatalogProvider } from "./provider";

const defaultBaseUrl = "https://plaivra-activity-catalog-api.vercel.app";

export type CreateActivityCatalogProviderOptions = {
  supabase: SupabaseClient | null;
  mode?: ActivityCatalogProviderMode;
  baseUrl?: string;
  apiKey?: string;
  fetch?: HttpActivityCatalogProviderOptions["fetch"];
  timeoutMs?: number;
  maxResponseBytes?: number;
  allowLocalHttp?: boolean;
};

function providerMode(value: string | undefined): ActivityCatalogProviderMode {
  const mode = value || "legacy";
  if (!["legacy", "external", "external_with_legacy_fallback"].includes(mode)) {
    throw new ActivityCatalogError("configuration_error");
  }
  return mode as ActivityCatalogProviderMode;
}

export function createActivityCatalogProvider(options: CreateActivityCatalogProviderOptions): ActivityCatalogProvider {
  const mode = providerMode(options.mode ?? process.env.PLAIVRA_ACTIVITY_CATALOG_MODE);
  const legacy = new LegacyActivityCatalogProvider(options.supabase);
  if (mode === "legacy") return new CompositeActivityCatalogProvider(mode, null, legacy);
  const external = new HttpActivityCatalogProvider({
    baseUrl: options.baseUrl ?? process.env.PLAIVRA_ACTIVITY_CATALOG_BASE_URL ?? defaultBaseUrl,
    apiKey: options.apiKey ?? process.env.PLAIVRA_ACTIVITY_CATALOG_API_KEY ?? "",
    ...(options.fetch ? { fetch: options.fetch } : {}),
    ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
    ...(options.maxResponseBytes ? { maxResponseBytes: options.maxResponseBytes } : {}),
    allowLocalHttp: options.allowLocalHttp ?? process.env.NODE_ENV !== "production"
  });
  return new CompositeActivityCatalogProvider(mode, external, legacy);
}
