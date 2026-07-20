import { readFileSync } from "node:fs";
import createNextIntlPlugin from "next-intl/plugin";

/** @type {import('next').NextConfig} */
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https://*.supabase.co https://images.unsplash.com data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "font-src 'self'",
  "frame-src https://www.youtube.com https://player.vimeo.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'"
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()"
  },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
    : []),
  { key: "Content-Security-Policy", value: contentSecurityPolicy }
];

const migrationLedger = JSON.parse(
  readFileSync(new URL("./supabase/migration-ledger.json", import.meta.url), "utf8")
);
const migrationEntries = migrationLedger.entries ?? [];
const latestAppliedMigration = [...migrationEntries]
  .filter((entry) => entry.state === "applied" && typeof entry.productionVersion === "string")
  .sort((left, right) => left.productionVersion.localeCompare(right.productionVersion))
  .at(-1)?.productionVersion ?? "";
const pendingMigrationCount = migrationEntries.filter((entry) => entry.state === "pending").length;
const schemaAppliedUntrackedCount = migrationEntries.filter(
  (entry) => entry.state === "applied_schema_untracked"
).length;
const unresolvedMigrationCount = migrationEntries.filter(
  (entry) => !["applied", "applied_version_alias"].includes(entry.state)
).length;

// Values in nextConfig.env are substituted into the built artifact. Runtime code
// must read these exact names directly rather than dynamically indexing
// process.env, otherwise provider build variables can disappear at runtime.
const releaseMetadata = {
  commitSha:
    process.env.PLAIVRA_COMMIT_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    "",
  buildTimestamp: process.env.PLAIVRA_BUILD_TIMESTAMP || new Date().toISOString(),
  environment:
    process.env.PLAIVRA_RELEASE_ENVIRONMENT ||
    process.env.VERCEL_ENV ||
    process.env.NODE_ENV ||
    "",
  schemaCompatibilityVersion: process.env.PLAIVRA_SCHEMA_COMPATIBILITY_VERSION || "2",
  expectedDatabaseMigrationVersion: latestAppliedMigration,
  migrationLedgerReconciliationState: migrationLedger.historyRepair?.state || "unknown",
  pendingMigrationCount: String(pendingMigrationCount),
  schemaAppliedUntrackedCount: String(schemaAppliedUntrackedCount),
  unresolvedMigrationCount: String(unresolvedMigrationCount)
};

const nextConfig = {
  typedRoutes: false,
  env: {
    PLAIVRA_COMMIT_SHA: releaseMetadata.commitSha,
    PLAIVRA_BUILD_TIMESTAMP: releaseMetadata.buildTimestamp,
    PLAIVRA_RELEASE_ENVIRONMENT: releaseMetadata.environment,
    PLAIVRA_SCHEMA_COMPATIBILITY_VERSION: releaseMetadata.schemaCompatibilityVersion,
    PLAIVRA_EXPECTED_DATABASE_MIGRATION_VERSION: releaseMetadata.expectedDatabaseMigrationVersion,
    PLAIVRA_MIGRATION_LEDGER_RECONCILIATION_STATE: releaseMetadata.migrationLedgerReconciliationState,
    PLAIVRA_PENDING_MIGRATION_COUNT: releaseMetadata.pendingMigrationCount,
    PLAIVRA_SCHEMA_APPLIED_UNTRACKED_COUNT: releaseMetadata.schemaAppliedUntrackedCount,
    PLAIVRA_UNRESOLVED_MIGRATION_COUNT: releaseMetadata.unresolvedMigrationCount
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co" }]
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async redirects() {
    return [{ source: "/today-workout", destination: "/my-workout/plans", permanent: true }];
  }
};

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

export { contentSecurityPolicy, releaseMetadata, securityHeaders };
export default withNextIntl(nextConfig);
