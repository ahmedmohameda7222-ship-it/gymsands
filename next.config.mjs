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

// These values are intentionally safe to expose through /api/version. Resolve
// them while Next.js is building so a deployment can prove which artifact is
// serving traffic even when the runtime does not retain provider build vars.
const releaseMetadata = {
  commitSha:
    process.env.PLAIVRA_COMMIT_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    "unknown",
  buildTimestamp: process.env.PLAIVRA_BUILD_TIMESTAMP || new Date().toISOString(),
  environment:
    process.env.PLAIVRA_RELEASE_ENVIRONMENT ||
    process.env.VERCEL_ENV ||
    process.env.NODE_ENV ||
    "unknown",
  schemaCompatibilityVersion: process.env.PLAIVRA_SCHEMA_COMPATIBILITY_VERSION || "2"
};

const nextConfig = {
  typedRoutes: false,
  env: {
    PLAIVRA_COMMIT_SHA: releaseMetadata.commitSha,
    PLAIVRA_BUILD_TIMESTAMP: releaseMetadata.buildTimestamp,
    PLAIVRA_RELEASE_ENVIRONMENT: releaseMetadata.environment,
    PLAIVRA_SCHEMA_COMPATIBILITY_VERSION: releaseMetadata.schemaCompatibilityVersion
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

export { contentSecurityPolicy, securityHeaders };
export default nextConfig;
