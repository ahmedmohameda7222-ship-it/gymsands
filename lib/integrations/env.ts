import "server-only";

import { NextResponse } from "next/server";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { env as publicEnv } from "@/lib/env";
import { checkUserLaunchEligibility } from "@/lib/auth/eligibility";

export const serverEnv = {
  supabaseUrl: publicEnv.supabaseUrl,
  supabaseAnonKey: publicEnv.supabaseAnonKey,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  appUrl: publicEnv.appUrl,
  wgerApiKey: process.env.WGER_API_KEY || "",
  plaivraMcpBaseUrl: process.env.PLAIVRA_MCP_BASE_URL || process.env.FITLIFE_MCP_BASE_URL || `${publicEnv.appUrl}/api/mcp`,
  plaivraOAuthIssuer: process.env.PLAIVRA_OAUTH_ISSUER || publicEnv.appUrl,
  plaivraMcpTokenSecret: process.env.PLAIVRA_MCP_TOKEN_SECRET || process.env.FITLIFE_MCP_TOKEN_SECRET || "",
  plaivraMcpOAuthClientId: process.env.PLAIVRA_MCP_OAUTH_CLIENT_ID || process.env.FITLIFE_MCP_OAUTH_CLIENT_ID || "",
  plaivraMcpOAuthClientSecret: process.env.PLAIVRA_MCP_OAUTH_CLIENT_SECRET || process.env.FITLIFE_MCP_OAUTH_CLIENT_SECRET || "",
  plaivraAllowLegacyMcpClientId: process.env.PLAIVRA_ALLOW_LEGACY_MCP_CLIENT_ID === "true",
  plaivraCimdAllowedOrigins: process.env.PLAIVRA_CIMD_ALLOWED_ORIGINS || "https://chatgpt.com",
  plaivraChatGptRedirectUris: process.env.PLAIVRA_CHATGPT_REDIRECT_URIS || "",
  plaivraMcpAllowedOrigins: process.env.PLAIVRA_MCP_ALLOWED_ORIGINS || process.env.FITLIFE_MCP_ALLOWED_ORIGINS || "",
  resendApiKey: process.env.RESEND_API_KEY || "",
  resendFromEmail: process.env.RESEND_FROM_EMAIL || "",
  cronSecret: process.env.CRON_SECRET || "",
  privacyDeletionExecutionEnabled: process.env.PRIVACY_DELETION_EXECUTION_ENABLED === "true",
  privacyRetentionExecutionEnabled: process.env.PRIVACY_RETENTION_EXECUTION_ENABLED === "true",
  privacyRetentionMcpAuditDays: process.env.PRIVACY_RETENTION_MCP_AUDIT_DAYS || "",
  privacyRetentionSecurityLogDays: process.env.PRIVACY_RETENTION_SECURITY_LOG_DAYS || "",
  privacyRetentionCompletedRequestDays: process.env.PRIVACY_RETENTION_COMPLETED_REQUEST_DAYS || "",
  privacyRetentionDeletionEvidenceDays: process.env.PRIVACY_RETENTION_DELETION_EVIDENCE_DAYS || "",
  privacyRetentionOauthCodeHours: process.env.PRIVACY_RETENTION_OAUTH_CODE_HOURS || "",
  privacyRetentionOauthTokenDays: process.env.PRIVACY_RETENTION_OAUTH_TOKEN_DAYS || "",
  privacyRetentionIdempotencyDaysAfterExpiry: process.env.PRIVACY_RETENTION_IDEMPOTENCY_DAYS_AFTER_EXPIRY || "",
  privacyNotificationEncryptionKey: process.env.PRIVACY_NOTIFICATION_ENCRYPTION_KEY || "",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  billingCheckoutEnabled: process.env.BILLING_CHECKOUT_ENABLED === "true"
};

export type RouteContext = {
  supabase: SupabaseClient;
  user: User;
  accessToken: string;
};

export function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

export function missingConfiguration(provider: string, keys: string[]) {
  return jsonError(`${provider} is not configured. Set ${keys.join(", ")} on the server to enable this feature.`, 503);
}

export function requireServerKeys(provider: string, entries: Array<[string, string]>) {
  const missing = entries.filter(([, value]) => !value).map(([key]) => key);
  return missing.length ? missingConfiguration(provider, missing) : null;
}

export function createSupabaseServerClient(authorization?: string | null, useServiceRole = false) {
  const key = useServiceRole && serverEnv.supabaseServiceRoleKey ? serverEnv.supabaseServiceRoleKey : serverEnv.supabaseAnonKey;
  return createClient(serverEnv.supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: authorization ? { headers: { Authorization: authorization } } : undefined
  });
}

export async function requireUser(request: Request): Promise<RouteContext | NextResponse> {
  const authorization = request.headers.get("authorization");
  if (!authorization) return jsonError("Please sign in before using this feature.", 401);
  const accessToken = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!accessToken) return jsonError("Please sign in before using this feature.", 401);

  const supabase = createSupabaseServerClient(authorization);
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return jsonError("Your session expired. Please sign in again.", 401);
  const accountState = await supabase
    .from("account_access_states")
    .select("state")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (accountState.error) {
    console.error("Plaivra account state check failed:", accountState.error.message);
    return jsonError("Account access could not be verified.", 503);
  }
  if (accountState.data?.state === "deletion_processing" || accountState.data?.state === "disabled") {
    return NextResponse.json(
      { error: "This account is being deleted and can no longer access Plaivra.", code: "account_deletion_processing" },
      { status: 403 }
    );
  }
  return { supabase, user: data.user, accessToken };
}

export async function requireEligibleUser(request: Request): Promise<RouteContext | NextResponse> {
  const context = await requireUser(request);
  if (context instanceof NextResponse) return context;

  const eligibility = await checkUserLaunchEligibility(context.supabase, context.user.id);
  if (!eligibility.eligible) {
    return NextResponse.json(
      { error: eligibility.message, code: eligibility.code },
      { status: eligibility.code === "age_verification_failed" ? 503 : 403 }
    );
  }

  return context;
}

export async function requireAdmin(request: Request): Promise<RouteContext | NextResponse> {
  const context = await requireUser(request);
  if (context instanceof NextResponse) return context;

  const { data, error } = await context.supabase.from("profiles").select("role").eq("id", context.user.id).maybeSingle();
  if (error) {
    console.error("Plaivra admin authorization check failed:", error.message);
    return jsonError("Admin access could not be verified.", 500);
  }
  if (data?.role !== "admin") return jsonError("Admin access is required for this action.", 403);
  return context;
}

export function configuredProviders() {
  return [
    { provider: "Open Food Facts", configured: true },
    { provider: "wger", configured: Boolean(serverEnv.wgerApiKey) },
    { provider: "ChatGPT MCP Connector", configured: Boolean(serverEnv.plaivraMcpBaseUrl && serverEnv.plaivraMcpTokenSecret && serverEnv.supabaseServiceRoleKey) },
    { provider: "Resend", configured: Boolean(serverEnv.resendApiKey && serverEnv.resendFromEmail) }
  ];
}
