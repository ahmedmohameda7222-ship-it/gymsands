import assert from "node:assert/strict";
import test from "node:test";
import { formatEnvironmentValidationFailure, validateProductionEnvironment } from "./validate-production-env.mjs";

const valid = {
  PLAIVRA_VALIDATE_PRODUCTION_ENV: "true",
  PLAIVRA_RELEASE_ENVIRONMENT: "production",
  PLAIVRA_COMMIT_SHA: "60a204d5fc20fc396be1b1b47e748c42ebba6abf",
  NEXT_PUBLIC_SUPABASE_URL: "https://exampleproject.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key-with-enough-length",
  SUPABASE_SERVICE_ROLE_KEY: "server-service-role-key-with-enough-length",
  NEXT_PUBLIC_APP_URL: "https://app.plaivra.com",
  NEXT_PUBLIC_USE_MOCK_AUTH: "false",
  CRON_SECRET: "cron-secret-that-is-at-least-thirty-two-characters"
};

test("does not enforce provider configuration for ordinary local builds", () => {
  assert.deepEqual(validateProductionEnvironment({ NODE_ENV: "development" }), { strict: false, errors: [] });
});

test("accepts complete core production configuration", () => {
  assert.deepEqual(validateProductionEnvironment(valid), { strict: true, errors: [] });
});

test("rejects missing and malformed core production configuration without values", () => {
  const result = validateProductionEnvironment({
    PLAIVRA_VALIDATE_PRODUCTION_ENV: "true",
    PLAIVRA_RELEASE_ENVIRONMENT: "production",
    PLAIVRA_COMMIT_SHA: "abcdef1",
    NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    NEXT_PUBLIC_USE_MOCK_AUTH: "true"
  });
  assert.equal(result.strict, true);
  assert.ok(result.errors.some((error) => error.startsWith("NEXT_PUBLIC_SUPABASE_URL:")));
  assert.ok(result.errors.some((error) => error.includes("exact 40-character")));
  assert.ok(result.errors.some((error) => error.startsWith("CRON_SECRET:")));
  const formatted = formatEnvironmentValidationFailure(result.errors);
  assert.doesNotMatch(formatted, /localhost:54321/);
  assert.doesNotMatch(formatted, /abcdef1/);
});

test("validates MCP and OAuth configuration only when enabled", () => {
  const result = validateProductionEnvironment({ ...valid, PLAIVRA_MCP_ENABLED: "true" });
  assert.ok(result.errors.some((error) => error.startsWith("PLAIVRA_MCP_BASE_URL:")));
  assert.ok(result.errors.some((error) => error.startsWith("PLAIVRA_OAUTH_ISSUER:")));
  assert.ok(result.errors.some((error) => error.startsWith("PLAIVRA_MCP_TOKEN_SECRET:")));
});

test("validates Stripe configuration only when checkout is enabled", () => {
  const result = validateProductionEnvironment({ ...valid, BILLING_CHECKOUT_ENABLED: "true" });
  assert.ok(result.errors.some((error) => error.startsWith("STRIPE_SECRET_KEY:")));
  assert.ok(result.errors.some((error) => error.startsWith("STRIPE_WEBHOOK_SECRET:")));
});

test("validates Activity Catalog configuration only for external modes", () => {
  assert.deepEqual(validateProductionEnvironment({ ...valid, PLAIVRA_ACTIVITY_CATALOG_MODE: "legacy" }).errors, []);
  const missing = validateProductionEnvironment({ ...valid, PLAIVRA_ACTIVITY_CATALOG_MODE: "external" });
  assert.ok(missing.errors.some((error) => error.startsWith("PLAIVRA_ACTIVITY_CATALOG_BASE_URL:")));
  assert.ok(missing.errors.some((error) => error.startsWith("PLAIVRA_ACTIVITY_CATALOG_API_KEY:")));
  assert.deepEqual(validateProductionEnvironment({
    ...valid,
    PLAIVRA_ACTIVITY_CATALOG_MODE: "external_with_legacy_fallback",
    PLAIVRA_ACTIVITY_CATALOG_BASE_URL: "https://catalog-api.plaivra.com",
    PLAIVRA_ACTIVITY_CATALOG_API_KEY: "server-only-catalog-key-with-enough-length"
  }).errors, []);
  const unsafe = validateProductionEnvironment({
    ...valid,
    PLAIVRA_ACTIVITY_CATALOG_MODE: "external",
    PLAIVRA_ACTIVITY_CATALOG_BASE_URL: "http://localhost:3000",
    PLAIVRA_ACTIVITY_CATALOG_API_KEY: "server-only-catalog-key-with-enough-length"
  });
  assert.ok(unsafe.errors.some((error) => error.startsWith("PLAIVRA_ACTIVITY_CATALOG_BASE_URL:")));
  const nonCanonical = validateProductionEnvironment({
    ...valid,
    PLAIVRA_ACTIVITY_CATALOG_MODE: "external",
    PLAIVRA_ACTIVITY_CATALOG_BASE_URL: "https://catalog-preview.example.com",
    PLAIVRA_ACTIVITY_CATALOG_API_KEY: "server-only-catalog-key-with-enough-length"
  });
  assert.ok(nonCanonical.errors.some((error) => error.startsWith("PLAIVRA_ACTIVITY_CATALOG_BASE_URL:")));
});

test("validates privacy execution key and retention periods conditionally", () => {
  const invalid = validateProductionEnvironment({ ...valid, PRIVACY_RETENTION_EXECUTION_ENABLED: "true" });
  assert.ok(invalid.errors.some((error) => error.startsWith("PRIVACY_NOTIFICATION_ENCRYPTION_KEY:")));
  assert.ok(invalid.errors.some((error) => error.startsWith("PRIVACY_RETENTION_MCP_AUDIT_DAYS:")));

  const retention = {
    PRIVACY_NOTIFICATION_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    PRIVACY_RETENTION_MCP_AUDIT_DAYS: "30",
    PRIVACY_RETENTION_SECURITY_LOG_DAYS: "30",
    PRIVACY_RETENTION_COMPLETED_REQUEST_DAYS: "30",
    PRIVACY_RETENTION_DELETION_EVIDENCE_DAYS: "90",
    PRIVACY_RETENTION_OAUTH_CODE_HOURS: "24",
    PRIVACY_RETENTION_OAUTH_TOKEN_DAYS: "30",
    PRIVACY_RETENTION_IDEMPOTENCY_DAYS_AFTER_EXPIRY: "7"
  };
  assert.deepEqual(
    validateProductionEnvironment({ ...valid, ...retention, PRIVACY_RETENTION_EXECUTION_ENABLED: "true" }).errors,
    []
  );
});
