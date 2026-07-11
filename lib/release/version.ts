export const DEFAULT_SCHEMA_COMPATIBILITY_VERSION = "2";

export type ReleaseVersion = {
  commitSha: string;
  buildTimestamp: string;
  environment: string;
  schemaCompatibilityVersion: string;
};

type ReleaseEnvironment = {
  PLAIVRA_COMMIT_SHA?: string;
  VERCEL_GIT_COMMIT_SHA?: string;
  GITHUB_SHA?: string;
  PLAIVRA_BUILD_TIMESTAMP?: string;
  PLAIVRA_RELEASE_ENVIRONMENT?: string;
  VERCEL_ENV?: string;
  NODE_ENV?: string;
  PLAIVRA_SCHEMA_COMPATIBILITY_VERSION?: string;
};

const SAFE_IDENTIFIER = /^[a-z0-9][a-z0-9._-]*$/i;
const SAFE_COMMIT_SHA = /^[a-f0-9]{7,64}$/i;

function safeIdentifier(value: string | undefined, fallback: string) {
  const normalized = value?.trim();
  return normalized && normalized.length <= 64 && SAFE_IDENTIFIER.test(normalized) ? normalized : fallback;
}

function safeCommitSha(value: string | undefined) {
  const normalized = value?.trim();
  return normalized && SAFE_COMMIT_SHA.test(normalized) ? normalized : "unknown";
}

function safeIsoTimestamp(value: string | undefined) {
  const normalized = value?.trim();
  if (!normalized) return "unknown";

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? "unknown" : parsed.toISOString();
}

export function getReleaseVersion(environment: ReleaseEnvironment = process.env): ReleaseVersion {
  return {
    commitSha: safeCommitSha(
      environment.PLAIVRA_COMMIT_SHA || environment.VERCEL_GIT_COMMIT_SHA || environment.GITHUB_SHA
    ),
    buildTimestamp: safeIsoTimestamp(environment.PLAIVRA_BUILD_TIMESTAMP),
    environment: safeIdentifier(
      environment.PLAIVRA_RELEASE_ENVIRONMENT || environment.VERCEL_ENV || environment.NODE_ENV,
      "unknown"
    ),
    schemaCompatibilityVersion: safeIdentifier(
      environment.PLAIVRA_SCHEMA_COMPATIBILITY_VERSION,
      DEFAULT_SCHEMA_COMPATIBILITY_VERSION
    )
  };
}
