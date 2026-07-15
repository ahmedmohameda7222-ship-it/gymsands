import process from "node:process";
import { pathToFileURL } from "node:url";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
const EXACT_SHA = /^[a-f0-9]{40}$/i;
const SAFE_IDENTIFIER = /^[a-z0-9][a-z0-9._-]{0,63}$/i;
const BASE64_32_BYTES = /^[A-Za-z0-9+/]{43}=$/;
const ACTIVITY_CATALOG_PRODUCTION_ORIGIN = "https://catalog-api.plaivra.com";

function enabled(value) {
  return value === "true";
}

function nonEmpty(value, minimum = 1) {
  return typeof value === "string" && value.trim().length >= minimum;
}

function validHttpsUrl(value, { supabase = false } = {}) {
  if (!value) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return false;
    if (supabase && !url.hostname.endsWith(".supabase.co")) return false;
    return true;
  } catch {
    return false;
  }
}

function validPositiveInteger(value) {
  return /^\d+$/.test(value ?? "") && Number(value) > 0;
}

export function isStrictProductionBuild(environment = process.env) {
  return enabled(environment.PLAIVRA_VALIDATE_PRODUCTION_ENV)
    || environment.VERCEL_ENV === "production"
    || environment.VERCEL_TARGET_ENV === "production"
    || environment.CONTEXT === "production"
    || environment.PLAIVRA_RELEASE_ENVIRONMENT === "production";
}

export function validateProductionEnvironment(environment = process.env) {
  const errors = [];
  const requireValue = (key, condition, message) => {
    if (!condition) errors.push(`${key}: ${message}`);
  };

  if (!isStrictProductionBuild(environment)) return { strict: false, errors };

  requireValue(
    "NEXT_PUBLIC_SUPABASE_URL",
    validHttpsUrl(environment.NEXT_PUBLIC_SUPABASE_URL, { supabase: true }),
    "must be an HTTPS Supabase project URL"
  );
  requireValue(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    nonEmpty(environment.NEXT_PUBLIC_SUPABASE_ANON_KEY, 20),
    "must be configured"
  );
  requireValue(
    "SUPABASE_SERVICE_ROLE_KEY",
    nonEmpty(environment.SUPABASE_SERVICE_ROLE_KEY, 20),
    "must be configured as a server-only secret"
  );
  requireValue(
    "NEXT_PUBLIC_APP_URL",
    validHttpsUrl(environment.NEXT_PUBLIC_APP_URL),
    "must be the canonical HTTPS application origin"
  );
  requireValue(
    "PLAIVRA_COMMIT_SHA or VERCEL_GIT_COMMIT_SHA or GITHUB_SHA",
    EXACT_SHA.test(
      environment.PLAIVRA_COMMIT_SHA
      || environment.VERCEL_GIT_COMMIT_SHA
      || environment.GITHUB_SHA
      || ""
    ),
    "must provide an exact 40-character Git SHA"
  );
  requireValue(
    "PLAIVRA_RELEASE_ENVIRONMENT or VERCEL_ENV",
    (environment.PLAIVRA_RELEASE_ENVIRONMENT || environment.VERCEL_ENV) === "production",
    "must resolve to production"
  );
  requireValue(
    "PLAIVRA_SCHEMA_COMPATIBILITY_VERSION",
    !environment.PLAIVRA_SCHEMA_COMPATIBILITY_VERSION
      || SAFE_IDENTIFIER.test(environment.PLAIVRA_SCHEMA_COMPATIBILITY_VERSION),
    "must be a safe identifier"
  );
  requireValue("CRON_SECRET", nonEmpty(environment.CRON_SECRET, 32), "must be configured because Vercel cron routes are enabled");
  requireValue("NEXT_PUBLIC_USE_MOCK_AUTH", environment.NEXT_PUBLIC_USE_MOCK_AUTH !== "true", "must be false in production");

  const catalogMode = environment.PLAIVRA_ACTIVITY_CATALOG_MODE || "legacy";
  requireValue(
    "PLAIVRA_ACTIVITY_CATALOG_MODE",
    ["legacy", "external", "external_with_legacy_fallback"].includes(catalogMode),
    "must be legacy, external, or external_with_legacy_fallback"
  );
  if (catalogMode === "external" || catalogMode === "external_with_legacy_fallback") {
    requireValue(
      "PLAIVRA_ACTIVITY_CATALOG_BASE_URL",
      validHttpsUrl(environment.PLAIVRA_ACTIVITY_CATALOG_BASE_URL)
        && new URL(environment.PLAIVRA_ACTIVITY_CATALOG_BASE_URL).origin === ACTIVITY_CATALOG_PRODUCTION_ORIGIN,
      `must use the canonical ${ACTIVITY_CATALOG_PRODUCTION_ORIGIN} origin`
    );
    requireValue(
      "PLAIVRA_ACTIVITY_CATALOG_API_KEY",
      nonEmpty(environment.PLAIVRA_ACTIVITY_CATALOG_API_KEY, 20),
      "must be configured as a server-only secret when the external catalog is enabled"
    );
  }

  const mcpEnabled = enabled(environment.PLAIVRA_MCP_ENABLED)
    || Boolean(environment.NEXT_PUBLIC_CHATGPT_CONNECT_URL)
    || Boolean(environment.NEXT_PUBLIC_PLAIVRA_MCP_SERVER_URL)
    || Boolean(environment.PLAIVRA_MCP_BASE_URL)
    || Boolean(environment.PLAIVRA_MCP_TOKEN_SECRET);
  if (mcpEnabled) {
    requireValue("PLAIVRA_MCP_BASE_URL", validHttpsUrl(environment.PLAIVRA_MCP_BASE_URL), "must be an HTTPS MCP URL");
    requireValue("PLAIVRA_OAUTH_ISSUER", validHttpsUrl(environment.PLAIVRA_OAUTH_ISSUER), "must be an HTTPS canonical issuer");
    requireValue("PLAIVRA_MCP_TOKEN_SECRET", nonEmpty(environment.PLAIVRA_MCP_TOKEN_SECRET, 32), "must be configured");
    requireValue("PLAIVRA_CIMD_ALLOWED_ORIGINS", nonEmpty(environment.PLAIVRA_CIMD_ALLOWED_ORIGINS), "must list approved HTTPS origins");
    requireValue("PLAIVRA_CHATGPT_REDIRECT_URIS", nonEmpty(environment.PLAIVRA_CHATGPT_REDIRECT_URIS), "must list exact callback URIs");
  }

  if (enabled(environment.BILLING_CHECKOUT_ENABLED)) {
    requireValue("STRIPE_SECRET_KEY", nonEmpty(environment.STRIPE_SECRET_KEY, 20), "is required when checkout is enabled");
    requireValue("STRIPE_WEBHOOK_SECRET", nonEmpty(environment.STRIPE_WEBHOOK_SECRET, 20), "is required when checkout is enabled");
  }

  const privacyDeletion = enabled(environment.PRIVACY_DELETION_EXECUTION_ENABLED);
  const privacyRetention = enabled(environment.PRIVACY_RETENTION_EXECUTION_ENABLED);
  if (privacyDeletion || privacyRetention) {
    requireValue(
      "PRIVACY_NOTIFICATION_ENCRYPTION_KEY",
      BASE64_32_BYTES.test(environment.PRIVACY_NOTIFICATION_ENCRYPTION_KEY ?? ""),
      "must be a base64-encoded 32-byte key when destructive privacy execution is enabled"
    );
  }
  if (privacyRetention) {
    for (const key of [
      "PRIVACY_RETENTION_MCP_AUDIT_DAYS",
      "PRIVACY_RETENTION_SECURITY_LOG_DAYS",
      "PRIVACY_RETENTION_COMPLETED_REQUEST_DAYS",
      "PRIVACY_RETENTION_DELETION_EVIDENCE_DAYS",
      "PRIVACY_RETENTION_OAUTH_CODE_HOURS",
      "PRIVACY_RETENTION_OAUTH_TOKEN_DAYS",
      "PRIVACY_RETENTION_IDEMPOTENCY_DAYS_AFTER_EXPIRY"
    ]) {
      requireValue(key, validPositiveInteger(environment[key]), "must be a positive integer when retention execution is enabled");
    }
  }

  return { strict: true, errors };
}

export function formatEnvironmentValidationFailure(errors) {
  return [
    "Plaivra production environment validation failed:",
    ...errors.map((error) => `- ${error}`),
    "Secret values were not printed. Configure the named variables in the deployment provider."
  ].join("\n");
}

async function main() {
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
  const result = validateProductionEnvironment(process.env);
  if (!result.strict) {
    console.log("Production environment validation not required for this local/non-production build.");
    return;
  }
  if (result.errors.length) {
    console.error(formatEnvironmentValidationFailure(result.errors));
    process.exit(1);
  }
  console.log("Production environment validation passed. Secret values were not printed.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
