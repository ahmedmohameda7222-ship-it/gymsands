import { readFileSync } from "node:fs";

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
  {
    key: "X-Content-Type-Options",
    value: "nosniff"
  },
  {
    key: "X-Frame-Options",
    value: "DENY"
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin"
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()"
  },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
    : []),
  {
    key: "Content-Security-Policy",
    value: contentSecurityPolicy
  }
];

const migrationLedger = JSON.parse(
  readFileSync(new URL("./supabase/migration-ledger.json", import.meta.url), "utf8")
);
const latestAppliedMigration = [...(migrationLedger.entries ?? [])]
  .filter((entry) => entry.state === "applied" && typeof entry.productionVersion === "string")
  .sort((left, right) => left.productionVersion.localeCompare(right.productionVersion))
  .at(-1)?.productionVersion ?? "";

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
  schemaAppliedUntrackedCount: String(migrationLedger.schemaVerifiedUntrackedCount ?? 0)
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
    PLAIVRA_SCHEMA_APPLIED_UNTRACKED_COUNT: releaseMetadata.schemaAppliedUntrackedCount
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co"
      }
    ]
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders
      }
    ];
  }
};

export { contentSecurityPolicy, releaseMetadata, securityHeaders };
export default nextConfig;
